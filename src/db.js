// All backend access lives here so the UI never touches Appwrite directly.
import { ID, Query, Permission, Role, OAuthProvider } from 'appwrite'
import { client, account, databases, teams, functions, DB, C, VAPID_PUBLIC_KEY } from './appwrite.js'
import { dueDates, nextDate, peopleBalances, myShares } from './split.js'

const genCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')

const norm = d => ({ ...d, id: d.$id, created_at: d.$createdAt })
const teamPerms = teamId => [
  Permission.read(Role.team(teamId)),
  Permission.update(Role.team(teamId)),
  Permission.delete(Role.team(teamId)),
]

/* ---------- offline cache ---------- */
// Last good result of each read is kept on the device so the app still opens with no signal.
// Signing out wipes it. Writes are not cached, except new expenses (see the outbox below).
const OFF = 'splitit.cache.'
export const isNetErr = e => !navigator.onLine || !e?.code || /network|failed to fetch|load failed/i.test(e?.message || '')
async function cached(key, fn) {
  try {
    const v = await fn()
    try { localStorage.setItem(OFF + key, JSON.stringify(v)) } catch { /* storage full: still fine online */ }
    return v
  } catch (e) {
    const saved = isNetErr(e) && localStorage.getItem(OFF + key)
    if (saved) return JSON.parse(saved)
    throw e
  }
}
function clearCache() { Object.keys(localStorage).filter(k => k.startsWith(OFF) || k === OUTBOX).forEach(k => localStorage.removeItem(k)) }

/* ---------- auth ---------- */
export async function getUser() {
  try {
    const a = await account.get()
    const u = { id: a.$id, email: a.email, name: a.name }
    localStorage.setItem(OFF + 'user', JSON.stringify(u))
    return u
  } catch (e) {
    // offline: stay signed in as the last user; a real 401 means signed out
    const saved = isNetErr(e) && localStorage.getItem(OFF + 'user')
    return saved ? JSON.parse(saved) : null
  }
}
export async function signUp(email, password, name) {
  await account.create(ID.unique(), email, password, name || email.split('@')[0])
  await account.createEmailPasswordSession(email, password)
}
export async function signIn(email, password) { await account.createEmailPasswordSession(email, password) }
export function signInWithGoogle() {
  // Full-page redirect to Google and back; the session is set on return.
  account.createOAuth2Session(OAuthProvider.Google, window.location.origin, window.location.origin)
}
export async function signOut() { clearCache(); try { await account.deleteSession('current') } catch { /* ignore */ } }
export async function recover(email) { await account.createRecovery(email, window.location.origin) }
export async function confirmRecovery(userId, secret, password) { await account.updateRecovery(userId, secret, password) }

// Accept a team invite if the URL carries Appwrite's membership params. Returns true on success.
// Keeps the params on failure (e.g. not logged in yet) so it can be retried after auth.
export async function acceptInviteFromUrl() {
  const q = new URLSearchParams(window.location.search)
  const teamId = q.get('teamId'), membershipId = q.get('membershipId'), userId = q.get('userId'), secret = q.get('secret')
  if (!(teamId && membershipId && userId && secret)) return false
  try {
    await teams.updateMembershipStatus(teamId, membershipId, userId, secret)
    window.history.replaceState({}, '', window.location.pathname)
    return true
  } catch { return false }
}
// Recovery params (set a new password). Returns {userId, secret} or null.
export function recoveryFromUrl() {
  const q = new URLSearchParams(window.location.search)
  const userId = q.get('userId'), secret = q.get('secret')
  return (userId && secret && !q.get('membershipId')) ? { userId, secret } : null
}
export function clearUrlParams() { window.history.replaceState({}, '', window.location.pathname) }

/* ---------- groups (one Appwrite Team per group) ---------- */
async function _listGroups(userId) {
  const t = await teams.list()
  const ids = t.teams.map(x => x.$id)
  if (!ids.length) return []
  const res = await databases.listDocuments(DB, C.groups, [Query.equal('team_id', ids), Query.limit(100)])
  const groups = res.documents.map(norm)
  // my net per group from everything I can read
  const [e, s, st] = await Promise.all([
    databases.listDocuments(DB, C.expenses, [Query.limit(2000)]),
    databases.listDocuments(DB, C.splits, [Query.limit(5000)]),
    databases.listDocuments(DB, C.settlements, [Query.limit(2000)]),
  ])
  const net = {}; groups.forEach(g => { net[g.id] = 0 })
  e.documents.forEach(x => { if (x.paid_by === userId && net[x.group_id] != null) net[x.group_id] += x.amount_cents })
  s.documents.forEach(x => { if (x.member_id === userId && net[x.group_id] != null) net[x.group_id] -= x.owed_cents })
  st.documents.forEach(x => { if (net[x.group_id] == null) return; if (x.from_member === userId) net[x.group_id] += x.amount_cents; if (x.to_member === userId) net[x.group_id] -= x.amount_cents })
  return groups.map(g => ({ ...g, myNet: net[g.id] || 0 }))
}
// kind: undefined for a normal group, 'friend' for a 1:1 friend (non-group expenses).
// Overall balance with each person across all my groups (see peopleBalances).
// shortcut: re-reads the same collections as listGroups and one membership list per group; fine for personal use, batch with listGroups if Home gets slow.
async function _listPeople(userId) {
  const t = await teams.list()
  const ids = t.teams.map(x => x.$id)
  if (!ids.length) return []
  const [gr, e, s, st] = await Promise.all([
    databases.listDocuments(DB, C.groups, [Query.equal('team_id', ids), Query.limit(100)]),
    databases.listDocuments(DB, C.expenses, [Query.limit(2000)]),
    databases.listDocuments(DB, C.splits, [Query.limit(5000)]),
    databases.listDocuments(DB, C.settlements, [Query.limit(2000)]),
  ])
  const groups = await Promise.all(gr.documents.map(async g => ({
    id: g.$id, team_id: g.team_id, name: g.name, currency: g.currency,
    members: await groupMembers(g).catch(() => []),
    expenses: e.documents.filter(x => x.group_id === g.$id).map(norm),
    splits: s.documents.filter(x => x.group_id === g.$id),
    settlements: st.documents.filter(x => x.group_id === g.$id),
  })))
  return peopleBalances(userId, groups)
}
export async function createGroup(name, currency, userId, kind) {
  const team = await teams.create(ID.unique(), name)
  const doc = await databases.createDocument(DB, C.groups, ID.unique(),
    { name, currency: currency || '$', team_id: team.$id, created_by: userId, join_code: genCode(), ...(kind && { kind }) }, teamPerms(team.$id))
  return doc.$id
}
// Join a group by its invite code via the server Function (adds you to the team).
export async function joinByCode(code, name) {
  const ex = await functions.createExecution('join-by-code', JSON.stringify({ code, name }), false)
  let r = {}
  try { r = JSON.parse(ex.responseBody || '{}') } catch { /* ignore */ }
  if (!r.ok) throw new Error(r.error || 'Could not join — is the code right?')
  return r.groupId
}
// Save (or clear with null) a group's default custom split: { type, txt, out }.
export async function setDefaultSplit(groupId, split) {
  await databases.updateDocument(DB, C.groups, groupId, { default_split: split ? JSON.stringify(split) : '' })
}
async function _getGroup(groupId) {
  return norm(await databases.getDocument(DB, C.groups, groupId))
}
// Backfill a join code for groups made before codes existed.
export async function ensureJoinCode(group) {
  if (group.join_code) return group.join_code
  const code = genCode()
  try { await databases.updateDocument(DB, C.groups, group.id, { join_code: code }); return code } catch { return null }
}
// All expenses across the user's groups (for home charts).
async function _listAllExpenses() {
  const r = await databases.listDocuments(DB, C.expenses, [Query.orderDesc('$createdAt'), Query.limit(2000)])
  return r.documents.map(norm)
}
// Recent activity across all the user's groups (RLS limits to groups they belong to).
async function _listRecentActivity(limit = 20) {
  const r = await databases.listDocuments(DB, C.activity, [Query.orderDesc('$createdAt'), Query.limit(limit)])
  return r.documents.map(norm)
}
export async function deleteGroup(group) {
  await databases.deleteDocument(DB, C.groups, group.id).catch(() => {})
  await teams.delete(group.team_id) // removes memberships; child docs become inaccessible (left as orphans)
}

/* ---------- members (team memberships) ---------- */
// Guests: people without an account, stored on the group as JSON [{ id: 'guest_…', name }].
// They take part in splits like anyone else; mergeGuest() hands their history to a real account.
export const parseGuests = g => { try { return JSON.parse(g.guests || '[]') } catch { return [] } }
export const isGuest = id => String(id).startsWith('guest_')
async function _groupMembers(group) {
  const team = await listMembers(group.team_id)
  return [...team, ...parseGuests(group).map(x => ({ user_id: x.id, display_name: x.name, guest: true, confirmed: true, membership_id: x.id, roles: [], email: '' }))]
}
async function saveGuests(groupId, change) {
  const fresh = await getGroup(groupId) // re-read so two people adding guests don't overwrite each other
  await databases.updateDocument(DB, C.groups, groupId, { guests: JSON.stringify(change(parseGuests(fresh))) })
}
export async function addGuest(groupId, name) {
  const guest = { id: 'guest_' + ID.unique().slice(-12), name: name.slice(0, 60) }
  await saveGuests(groupId, list => [...list, guest])
  return guest
}
export async function removeGuest(groupId, guestId) { await saveGuests(groupId, list => list.filter(x => x.id !== guestId)) }
// Move everything recorded for a guest onto a real member, then drop the guest.
export async function mergeGuest(groupId, guestId, userId) {
  const q = [Query.equal('group_id', groupId), Query.limit(5000)]
  const [e, s, st] = await Promise.all([C.expenses, C.splits, C.settlements].map(c => databases.listDocuments(DB, c, q)))
  const swap = v => v === guestId ? userId : v
  await Promise.all([
    ...e.documents.filter(d => d.paid_by === guestId).map(d => databases.updateDocument(DB, C.expenses, d.$id, { paid_by: userId })),
    ...s.documents.filter(d => d.member_id === guestId).map(d => databases.updateDocument(DB, C.splits, d.$id, { member_id: userId })),
    ...st.documents.filter(d => d.from_member === guestId || d.to_member === guestId)
      .map(d => databases.updateDocument(DB, C.settlements, d.$id, { from_member: swap(d.from_member), to_member: swap(d.to_member) })),
  ])
  await removeGuest(groupId, guestId)
}

// Appwrite Cloud returns an empty userId for everyone but you, so fill the gaps from the
// server function. membershipId -> userId never changes, so answers are cached on the device.
const MID_KEY = 'splitit.memberIds'
async function fillUserIds(teamId, memberships) {
  if (!memberships.some(m => !m.userId)) return memberships
  let cache = {}
  try { cache = JSON.parse(localStorage.getItem(MID_KEY) || '{}') } catch { /* ignore */ }
  if (memberships.some(m => !m.userId && !cache[m.$id])) {
    try {
      const ex = await functions.createExecution('join-by-code', JSON.stringify({ action: 'members', teamId }), false)
      const r = JSON.parse(ex.responseBody || '{}')
      if (r.ok) {
        r.members.forEach(x => { if (x.user_id) cache[x.membership_id] = x.user_id })
        localStorage.setItem(MID_KEY, JSON.stringify(cache))
      }
    } catch { /* leave blanks; the UI warns and blocks saving */ }
  }
  return memberships.map(m => m.userId ? m : { ...m, userId: cache[m.$id] || '' })
}

export async function listMembers(teamId) {
  const res = await teams.listMemberships(teamId)
  return (await fillUserIds(teamId, res.memberships)).map(m => ({
    user_id: m.userId, display_name: m.userName || m.userEmail || 'Member',
    membership_id: m.$id, confirmed: m.confirm, roles: m.roles || [], email: m.userEmail || '',
  }))
}
export async function inviteByEmail(teamId, email) {
  // Appwrite emails the person an accept link that returns to this app's origin.
  return teams.createMembership(teamId, ['member'], email, undefined, undefined, window.location.origin)
}
export async function removeMember(teamId, membershipId) { await teams.deleteMembership(teamId, membershipId) }
export async function leaveGroup(teamId, myMembershipId) { await teams.deleteMembership(teamId, myMembershipId) }

/* ---------- group data ---------- */
async function _loadGroupData(groupId) {
  const [exp, spl, set, act] = await Promise.all([
    databases.listDocuments(DB, C.expenses, [Query.equal('group_id', groupId), Query.orderDesc('$createdAt'), Query.limit(500)]),
    databases.listDocuments(DB, C.splits, [Query.equal('group_id', groupId), Query.limit(2000)]),
    databases.listDocuments(DB, C.settlements, [Query.equal('group_id', groupId), Query.orderDesc('$createdAt'), Query.limit(500)]),
    databases.listDocuments(DB, C.activity, [Query.equal('group_id', groupId), Query.orderDesc('$createdAt'), Query.limit(60)]),
  ])
  return {
    expenses: exp.documents.map(norm), splits: spl.documents.map(norm),
    settlements: set.documents.map(norm), activity: act.documents.map(norm),
  }
}
export function subscribeGroup(teamId, cb) {
  const chans = [C.expenses, C.splits, C.settlements, C.activity].map(c => `databases.${DB}.collections.${c}.documents`)
  chans.push(`teams.${teamId}.memberships`)
  return client.subscribe(chans, () => cb())
}

// Any change to expenses, payments or groups you can see (used by the desktop sidebar to stay current).
export function subscribeAll(cb) {
  return client.subscribe([C.expenses, C.splits, C.settlements, C.groups].map(c => `databases.${DB}.collections.${c}.documents`), () => cb())
}

export async function logActivity(group, actorName, text) {
  await databases.createDocument(DB, C.activity, ID.unique(),
    { group_id: group.id, actor_name: actorName, text }, teamPerms(group.team_id)).catch(() => {})
}

/* ---------- expenses ---------- */
// `extra` holds optional fields (repeat, next_on, notes); callers only include keys that are set,
// so saving still works on a backend that hasn't been re-provisioned yet.
export async function addExpense(group, { description, amount_cents, paid_by, category, spent_on, owed, extra = {} }, userId) {
  const exp = await databases.createDocument(DB, C.expenses, ID.unique(),
    { group_id: group.id, description, amount_cents, paid_by, category, spent_on, created_by: userId, ...extra }, teamPerms(group.team_id))
  await Promise.all(Object.entries(owed).map(([member_id, owed_cents]) =>
    databases.createDocument(DB, C.splits, ID.unique(),
      { expense_id: exp.$id, group_id: group.id, member_id, owed_cents }, teamPerms(group.team_id))))
  return exp.$id
}
export async function updateExpense(group, expenseId, { description, amount_cents, paid_by, category, spent_on, owed, extra = {} }) {
  await databases.updateDocument(DB, C.expenses, expenseId, { description, amount_cents, paid_by, category, spent_on, ...extra, edited_at: new Date().toISOString() })
  const old = await databases.listDocuments(DB, C.splits, [Query.equal('expense_id', expenseId), Query.limit(2000)])
  await Promise.all(old.documents.map(d => databases.deleteDocument(DB, C.splits, d.$id)))
  await Promise.all(Object.entries(owed).map(([member_id, owed_cents]) =>
    databases.createDocument(DB, C.splits, ID.unique(),
      { expense_id: expenseId, group_id: group.id, member_id, owed_cents }, teamPerms(group.team_id))))
}
export async function deleteExpense(expenseId) {
  const splits = await databases.listDocuments(DB, C.splits, [Query.equal('expense_id', expenseId), Query.limit(2000)])
  await Promise.all(splits.documents.map(d => databases.deleteDocument(DB, C.splits, d.$id)))
  await databases.deleteDocument(DB, C.expenses, expenseId)
}

// Materialize due copies of recurring expenses. Returns how many were created.
// The template's next_on is advanced *before* copying so a second viewer loading at the same time
// usually sees nothing due. shortcut: not a true lock — two simultaneous loads can still double-post; move to a scheduled Appwrite Function if that shows up.
export async function runRecurring(group, expenses, splits, userId) {
  const today = new Date().toISOString().slice(0, 10)
  let made = 0
  for (const e of expenses) {
    if (!e.repeat || !e.next_on) continue
    const dates = dueDates(e.next_on, e.repeat, today)
    if (!dates.length) continue
    await databases.updateDocument(DB, C.expenses, e.id, { next_on: nextDate(dates[dates.length - 1], e.repeat) })
    const owed = Object.fromEntries(splits.filter(s => s.expense_id === e.id).map(s => [s.member_id, s.owed_cents]))
    for (const d of dates) {
      await addExpense(group, { description: e.description, amount_cents: e.amount_cents, paid_by: e.paid_by, category: e.category, spent_on: d, owed }, userId)
      made++
    }
  }
  return made
}

/* ---------- settlements ---------- */
export async function addSettlement(group, { from_member, to_member, amount_cents }) {
  await databases.createDocument(DB, C.settlements, ID.unique(),
    { group_id: group.id, from_member, to_member, amount_cents }, teamPerms(group.team_id))
}

/* ---------- messages ---------- */
export async function listMessages(groupId) {
  const r = await databases.listDocuments(DB, C.messages, [Query.equal('group_id', groupId), Query.orderAsc('$createdAt'), Query.limit(200)])
  return r.documents.map(norm)
}
export async function sendMessage(group, userId, displayName, body) {
  await databases.createDocument(DB, C.messages, ID.unique(),
    { group_id: group.id, user_id: userId, display_name: displayName, body }, teamPerms(group.team_id))
}
export function subscribeMessages(groupId, onNew) {
  return client.subscribe(`databases.${DB}.collections.${C.messages}.documents`, e => {
    const d = e.payload
    if (d && d.group_id === groupId && e.events.some(ev => ev.endsWith('.create'))) onNew(norm(d))
  })
}

/* ---------- comments ---------- */
export async function listComments(expenseId) {
  const r = await databases.listDocuments(DB, C.comments, [Query.equal('expense_id', expenseId), Query.orderAsc('$createdAt'), Query.limit(200)])
  return r.documents.map(norm)
}
export async function addComment(group, expenseId, userId, displayName, body) {
  await databases.createDocument(DB, C.comments, ID.unique(),
    { group_id: group.id, expense_id: expenseId, user_id: userId, display_name: displayName, body }, teamPerms(group.team_id))
}
export function subscribeComments(expenseId, onNew) {
  return client.subscribe(`databases.${DB}.collections.${C.comments}.documents`, e => {
    const d = e.payload
    if (d && d.expense_id === expenseId && e.events.some(ev => ev.endsWith('.create'))) onNew(norm(d))
  })
}

// Phone-notification reminder (server checks both people are in the group). Returns how many devices got it.
export async function pushReminder(groupId, toUserId, amount) {
  const ex = await functions.createExecution('notify-expense', JSON.stringify({ action: 'remind', groupId, toUserId, amount }), false)
  try { return JSON.parse(ex.responseBody || '{}').sent || 0 } catch { return 0 }
}
// Email a payment reminder (server checks both people are in the group). Returns true if sent.
export async function emailReminder(groupId, toUserId, amount) {
  const ex = await functions.createExecution('join-by-code', JSON.stringify({ action: 'remind', groupId, toUserId, amount }), false)
  try { return !!JSON.parse(ex.responseBody || '{}').ok } catch { return false }
}

// Settle everything with one person: record the matching payment in each group (parts from peopleBalances).
export async function settleAll(person, me) {
  for (const part of person.parts) {
    const a = Math.abs(part.amount)
    if (!a) continue
    const [from_member, to_member] = part.amount > 0 ? [person.user_id, me.id] : [me.id, person.user_id]
    await addSettlement(part.group, { from_member, to_member, amount_cents: a })
    logActivity(part.group, me.name, `${part.amount > 0 ? person.name : me.name} paid ${part.amount > 0 ? me.name : person.name} ${person.cur}${(a / 100).toFixed(2)} (settled all across groups)`)
  }
}

/* ---------- invite links ---------- */
export const inviteLink = code => `${window.location.origin}/?join=${encodeURIComponent(code)}`
// Share sheet on phones, clipboard elsewhere. Returns 'shared' | 'copied' | null (cancelled).
export async function shareText(title, text, url) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return 'shared' }
    catch (e) { if (e.name === 'AbortError') return null }
  }
  await navigator.clipboard.writeText(url ? `${text} ${url}` : text)
  return 'copied'
}

/* ---------- exchange rates ---------- */
// Today's rate from -> to via Frankfurter (free, no key; only the two currency codes are sent).
export async function fetchRate(from, to) {
  if (from === to) return 1
  const r = await fetch(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`)
  if (!r.ok) throw new Error('Rate service unavailable')
  const rate = (await r.json()).rates?.[to]
  if (!rate) throw new Error('No rate for ' + from)
  return rate
}

/* ---------- push notifications ---------- */
// 'unsupported' (e.g. iPhone Safari tab: add to Home Screen first) | 'denied' | 'on' | 'off'
export async function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off'
}
const b64ToBytes = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)) }
// One document per device; the id is derived from the endpoint so re-subscribing updates it.
async function subDocId(endpoint) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)))
  return 'p' + [...h].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 35)
}
export async function enablePush(userId) {
  if (await Notification.requestPermission() !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) })
  const j = sub.toJSON(), id = await subDocId(j.endpoint)
  const data = { user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }
  const mine = [Permission.read(Role.user(userId)), Permission.update(Role.user(userId)), Permission.delete(Role.user(userId))]
  try { await databases.createDocument(DB, C.push, id, data, mine) }
  catch (e) { if (e.code === 409) await databases.updateDocument(DB, C.push, id, data); else throw e }
  return 'on'
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return 'off'
  await databases.deleteDocument(DB, C.push, await subDocId(sub.endpoint)).catch(() => {})
  await sub.unsubscribe()
  return 'off'
}

// Your share of every expense you're in, across all groups (see myShares).
async function _listMySpending(userId) {
  const [sp, ex] = await Promise.all([
    databases.listDocuments(DB, C.splits, [Query.equal('member_id', userId), Query.limit(5000)]),
    databases.listDocuments(DB, C.expenses, [Query.limit(5000)]),
  ])
  return myShares(userId, ex.documents.map(norm), sp.documents)
}
// Archived groups are personal (they tidy only your Home) and live in your account prefs, so they follow you across devices.
async function _getArchived() { return (await account.getPrefs()).archived || [] }
export async function setArchived(groupId, on) {
  const prefs = await account.getPrefs()
  const list = new Set(prefs.archived || [])
  if (on) list.add(groupId); else list.delete(groupId)
  await account.updatePrefs({ ...prefs, archived: [...list] })
  try { localStorage.setItem(OFF + 'archived', JSON.stringify([...list])) } catch { /* ignore */ }
}
// Monthly budget per currency, in your account prefs: { '$': 80000 }. 0 / missing = no budget.
async function _getBudgets() { return (await account.getPrefs()).budgets || {} }
export async function setBudget(cur, cents) {
  const prefs = await account.getPrefs()
  const budgets = { ...(prefs.budgets || {}) }
  if (cents > 0) budgets[cur] = cents; else delete budgets[cur]
  await account.updatePrefs({ ...prefs, budgets })
  try { localStorage.setItem(OFF + 'budgets', JSON.stringify(budgets)) } catch { /* ignore */ }
  return budgets
}
// Cached readers (fall back to the last saved copy when offline).
export const getBudgets = (...a) => cached('budgets', () => _getBudgets(...a))
export const getArchived = (...a) => cached('archived', () => _getArchived(...a))
export const listMySpending = (...a) => cached('spend', () => _listMySpending(...a))
export const listGroups = (...a) => cached('groups', () => _listGroups(...a))
export const listPeople = (...a) => cached('people', () => _listPeople(...a))
export const getGroup = (...a) => cached('group.' + a[0], () => _getGroup(...a))
export const listAllExpenses = (...a) => cached('allexp', () => _listAllExpenses(...a))
export const listRecentActivity = (...a) => cached('activity', () => _listRecentActivity(...a))
export const groupMembers = (...a) => cached('members.' + (a[0].id || a[0].$id), () => _groupMembers(...a))
export const loadGroupData = (...a) => cached('data.' + a[0], () => _loadGroupData(...a))

/* ---------- offline outbox ---------- */
// New expenses added with no connection wait here and upload when the device is back online.
const OUTBOX = 'splitit.outbox'
const readOutbox = () => { try { return JSON.parse(localStorage.getItem(OUTBOX) || '[]') } catch { return [] } }
const writeOutbox = q => { localStorage.setItem(OUTBOX, JSON.stringify(q)); window.dispatchEvent(new Event('splitit-outbox')) }
export const pendingFor = groupId => readOutbox().filter(x => !groupId || x.group.id === groupId)
export async function addExpenseOrQueue(group, payload, userId, actorName) {
  if (navigator.onLine) {
    try { return await addExpense(group, payload, userId) } catch (e) { if (!isNetErr(e)) throw e }
  }
  writeOutbox([...readOutbox(), { key: 'q' + Date.now(), group: { id: group.id, team_id: group.team_id }, payload, userId, actorName }])
  return 'queued'
}
let flushing = false
export async function flushOutbox() {
  if (flushing || !navigator.onLine) return 0
  flushing = true
  let done = 0
  try {
    for (const item of readOutbox()) {
      try {
        await addExpense(item.group, item.payload, item.userId)
        logActivity(item.group, item.actorName || 'Someone', `added “${item.payload.description}” (synced)`)
        writeOutbox(readOutbox().filter(x => x.key !== item.key)); done++
      } catch (e) { if (isNetErr(e)) break; writeOutbox(readOutbox().filter(x => x.key !== item.key)) } // drop items the server rejects
    }
  } finally { flushing = false }
  if (done) window.dispatchEvent(new Event('splitit-synced'))
  return done
}
