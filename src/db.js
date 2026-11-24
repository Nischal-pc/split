// All backend access lives here so the UI never touches Appwrite directly.
import { ID, Query, Permission, Role, OAuthProvider } from 'appwrite'
import { client, account, databases, teams, functions, DB, C } from './appwrite.js'

const genCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')

const norm = d => ({ ...d, id: d.$id, created_at: d.$createdAt })
const teamPerms = teamId => [
  Permission.read(Role.team(teamId)),
  Permission.update(Role.team(teamId)),
  Permission.delete(Role.team(teamId)),
]

/* ---------- auth ---------- */
export async function getUser() {
  try { const a = await account.get(); return { id: a.$id, email: a.email, name: a.name } }
  catch { return null }
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
export async function signOut() { try { await account.deleteSession('current') } catch { /* ignore */ } }
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
export async function listGroups(userId) {
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
export async function createGroup(name, currency, userId) {
  const team = await teams.create(ID.unique(), name)
  const doc = await databases.createDocument(DB, C.groups, ID.unique(),
    { name, currency: currency || '$', team_id: team.$id, created_by: userId, join_code: genCode() }, teamPerms(team.$id))
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
export async function getGroup(groupId) {
  return norm(await databases.getDocument(DB, C.groups, groupId))
}
export async function deleteGroup(group) {
  await databases.deleteDocument(DB, C.groups, group.id).catch(() => {})
  await teams.delete(group.team_id) // removes memberships; child docs become inaccessible (left as orphans)
}

/* ---------- members (team memberships) ---------- */
export async function listMembers(teamId) {
  const res = await teams.listMemberships(teamId)
  return res.memberships.map(m => ({
    user_id: m.userId, display_name: m.userName || m.userEmail || 'Member',
    membership_id: m.$id, confirmed: m.confirm,
  }))
}
export async function inviteByEmail(teamId, email) {
  // Appwrite emails the person an accept link that returns to this app's origin.
  return teams.createMembership(teamId, ['member'], email, undefined, undefined, window.location.origin)
}
export async function removeMember(teamId, membershipId) { await teams.deleteMembership(teamId, membershipId) }
export async function leaveGroup(teamId, myMembershipId) { await teams.deleteMembership(teamId, myMembershipId) }

/* ---------- group data ---------- */
export async function loadGroupData(groupId) {
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

export async function logActivity(group, actorName, text) {
  await databases.createDocument(DB, C.activity, ID.unique(),
    { group_id: group.id, actor_name: actorName, text }, teamPerms(group.team_id)).catch(() => {})
}

/* ---------- expenses ---------- */
export async function addExpense(group, { description, amount_cents, paid_by, category, spent_on, owed }, userId) {
  const exp = await databases.createDocument(DB, C.expenses, ID.unique(),
    { group_id: group.id, description, amount_cents, paid_by, category, spent_on, created_by: userId }, teamPerms(group.team_id))
  await Promise.all(Object.entries(owed).map(([member_id, owed_cents]) =>
    databases.createDocument(DB, C.splits, ID.unique(),
      { expense_id: exp.$id, group_id: group.id, member_id, owed_cents }, teamPerms(group.team_id))))
  return exp.$id
}
export async function updateExpense(group, expenseId, { description, amount_cents, paid_by, category, spent_on, owed }) {
  await databases.updateDocument(DB, C.expenses, expenseId, { description, amount_cents, paid_by, category, spent_on })
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
