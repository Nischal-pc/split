// Appwrite Function: push notifications for SplitIt.
// 1) Events: tell the rest of the group about expenses (add / edit / delete), payments, chat messages,
//    comments, and people joining or leaving.
// 2) Called by a signed-in user with { action: 'remind', groupId, toUserId, amount }: nudge one person to pay.
// 3) Scheduled on the 1st of each month: "Your October recap" to everyone with notifications on.
// Variables: APPWRITE_API_KEY, APP_DB_ID, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { Client, Databases, Teams, Query } from 'node-appwrite'
import webpush from 'web-push'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const money = (c, cur = '$') => cur + (Math.abs(c) / 100).toFixed(2)

export default async ({ req, res, log, error }) => {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT
  const project = process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID
  const DB = process.env.APP_DB_ID || 'splitit'
  const client = new Client().setEndpoint(endpoint).setProject(project).setKey(process.env.APPWRITE_API_KEY)
  const databases = new Databases(client)
  const teams = new Teams(client)
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://split-lake-tau.vercel.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)

  // Send one payload to every device a user has; forget devices that no longer exist.
  async function pushTo(userIds, makePayload) {
    if (!userIds.length) return { sent: 0, devices: 0 }
    // user_id is written by the browser, so a member could register their own phone under someone else's id.
    // Only trust a device whose row permissions were granted by that same user (Appwrite won't let anyone
    // grant permissions in another user's name).
    const subs = (await databases.listDocuments(DB, 'push_subs', [Query.equal('user_id', userIds), Query.limit(500)])).documents
      .filter(s => (s.$permissions || []).includes(`read("user:${s.user_id}")`))
    let sent = 0
    await Promise.all(subs.map(async s => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(makePayload(s)), { TTL: 86400 }); sent++ }
      catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await databases.deleteDocument(DB, 'push_subs', s.$id).catch(() => {})
        else error(`push failed (${e.statusCode}): ${e.body || e.message}`)
      }
    }))
    return { sent, devices: subs.length }
  }

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body || '{}') } catch { body = {} } }

  // ---- 3) monthly recap: runs on the schedule (1st of the month), or when run with the server key ----
  const trigger = req.headers['x-appwrite-trigger']
  if (trigger === 'schedule' || (body?.action === 'recap' && !req.headers['x-appwrite-user-id'])) {
    // daily tidy-up of old join-code attempts (see join-by-code)
    if (trigger === 'schedule') {
      const old = await databases.listDocuments(DB, 'join_attempts', [Query.lessThan('$createdAt', new Date(Date.now() - 86400000).toISOString()), Query.limit(500)]).catch(() => ({ documents: [] }))
      await Promise.all(old.documents.map(d => databases.deleteDocument(DB, 'join_attempts', d.$id).catch(() => {})))
    }
    // The free plan only allows a daily schedule, so skip every day except the 1st.
    if (trigger === 'schedule' && new Date().getUTCDate() !== 1) return res.json({ ok: true, skipped: 'not the 1st' })
    try {
      const now = new Date()
      const ym = body?.month || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
      const monthLabel = new Date(ym + '-01T12:00:00Z').toLocaleString('en-CA', { month: 'long', timeZone: 'UTC' })
      const subs = (await databases.listDocuments(DB, 'push_subs', [Query.limit(500)])).documents
      let users = [...new Set(subs.map(s => s.user_id))]
      // server-key test runs can limit the recap to specific people so real users aren't notified
      if (trigger !== 'schedule' && Array.isArray(body?.only)) users = users.filter(u => body.only.includes(u))
      if (!users.length) return res.json({ ok: true, month: ym, sent: 0 })
      const exps = (await databases.listDocuments(DB, 'expenses', [Query.startsWith('spent_on', ym), Query.limit(5000)])).documents
      const byId = Object.fromEntries(exps.map(e => [e.$id, e]))
      const groupCur = {}
      for (const gid of [...new Set(exps.map(e => e.group_id))]) groupCur[gid] = (await databases.getDocument(DB, 'groups', gid).catch(() => ({}))).currency || '$'
      // per user: total per currency + groups, from their splits of that month's expenses
      const spent = {}
      for (let i = 0; i < users.length; i += 100) {
        const sp = (await databases.listDocuments(DB, 'splits', [Query.equal('member_id', users.slice(i, i + 100)), Query.limit(5000)])).documents
        for (const s of sp) {
          const e = byId[s.expense_id]; if (!e) continue
          const u = spent[s.member_id] ||= { cur: {}, groups: new Set() }
          const c = groupCur[e.group_id]; u.cur[c] = (u.cur[c] || 0) + s.owed_cents; u.groups.add(e.group_id)
        }
      }
      const targets = users.filter(u => spent[u])
      const r = await pushTo(targets, sub => {
        const u = spent[sub.user_id], [c, cents] = Object.entries(u.cur).sort((a, b) => b[1] - a[1])[0]
        return { title: `Your ${monthLabel} recap`, body: `You spent ${money(cents, c)} across ${u.groups.size} group${u.groups.size === 1 ? '' : 's'}. Tap to see where it went.`,
          url: `/?recap=${ym}`, tag: `recap-${ym}` }
      })
      log(`recap ${ym}: ${targets.length} people, sent ${r.sent}/${r.devices}`)
      return res.json({ ok: true, month: ym, people: targets.length, ...r })
    } catch (e) {
      error(e.message)
      return res.json({ ok: false, error: e.message }, 500)
    }
  }

  // ---- 2) payment reminder from one member to another ----
  if (body?.action === 'remind' && !req.headers['x-appwrite-event']) {
    const callerId = req.headers['x-appwrite-user-id']
    const groupId = String(body.groupId || ''), toUserId = String(body.toUserId || '')
    const amount = Math.round(Number(body.amount))
    if (!callerId) return res.json({ ok: false, error: 'Please sign in first' }, 401)
    if (!groupId || !toUserId || toUserId === callerId || !(amount > 0 && amount < 1e9)) return res.json({ ok: false, error: 'Bad request' }, 400)
    try {
      const group = await databases.getDocument(DB, 'groups', groupId)
      const mems = (await teams.listMemberships(group.team_id, [Query.limit(100)])).memberships
      const me = mems.find(m => m.userId === callerId), them = mems.find(m => m.userId === toUserId)
      if (!me || !them) return res.json({ ok: false, error: 'Not in this group' }, 403)
      const r = await pushTo([toUserId], () => ({
        title: `SplitIt · ${group.name}`,
        body: `🔔 ${me.userName || 'A friend'} is reminding you: you owe ${money(amount, group.currency || '$')}. Tap to settle up.`,
        url: `/?group=${group.$id}`,
        tag: `remind-${group.$id}`,
      }))
      log(`remind ${group.$id}: sent ${r.sent}/${r.devices}`)
      return res.json({ ok: true, ...r })
    } catch (e) {
      error(e.message)
      return res.json({ ok: false, error: 'Could not send the reminder' }, 500)
    }
  }

  const event = String(req.headers['x-appwrite-event'] || '')

  // ---- 1b) payments, chat, comments, members ----
  const other = event.match(/collections\.(settlements|messages|comments)\.documents\.[^.]+\.create$/)?.[1]
    || event.match(/^teams\.[^.]+\.memberships\.[^.]+\.(create|delete)$/)?.[1]
  if (other) {
    try {
      const joining = other === 'create' || other === 'delete'
      const group = joining
        ? (await databases.listDocuments(DB, 'groups', [Query.equal('team_id', String(body.teamId)), Query.limit(1)])).documents[0]
        : await databases.getDocument(DB, 'groups', body.group_id)
      if (!group) return res.json({ ok: true, skipped: 'no group yet' }) // the creator's own membership
      const mems = (await teams.listMemberships(group.team_id, [Query.limit(100)])).memberships
      const guests = JSON.parse(group.guests || '[]')
      const nameOf = id => mems.find(m => m.userId === id)?.userName || guests.find(g => g.id === id)?.name || 'Someone'
      const actorId = joining ? body.userId : other === 'settlements' ? req.headers['x-appwrite-user-id'] : body.user_id
      const cur = group.currency || '$'
      const clip = s => String(s || '').slice(0, 120)
      let text
      if (other === 'settlements') text = `${nameOf(body.from_member)} paid ${nameOf(body.to_member)} ${money(body.amount_cents, cur)}`
      else if (other === 'messages') text = `${body.display_name}: ${clip(body.body)}`
      else if (other === 'comments') {
        const exp = await databases.getDocument(DB, 'expenses', body.expense_id).catch(() => null)
        text = `${body.display_name} commented${exp ? ` on “${exp.description}”` : ''}: ${clip(body.body)}`
      } else text = `${body.userName || 'Someone'} ${other === 'create' ? 'joined' : 'left'} the group`
      const r = await pushTo(mems.map(m => m.userId).filter(id => id && id !== actorId), () => ({
        title: `SplitIt · ${group.name}`, body: text, url: `/?group=${group.$id}`,
        tag: other === 'messages' ? `chat-${group.$id}` : body.$id,
      }))
      log(`${other} ${body.$id}: sent ${r.sent}/${r.devices}`)
      return res.json({ ok: true, ...r })
    } catch (e) {
      error(e.message)
      return res.json({ ok: false, error: e.message }, 500)
    }
  }

  // ---- 1) expense added / edited / deleted ----
  const kind = !event.includes('collections.expenses.') ? '' : event.endsWith('.create') ? 'added' : event.endsWith('.delete') ? 'deleted' : event.endsWith('.update') ? 'edited' : ''
  const doc = body
  if (!kind || !doc?.group_id) return res.json({ ok: true, skipped: 'not an expense event' })

  // Background updates (recurring next_on, linking a guest) don't set edited_at; only real edits do.
  if (kind === 'edited' && !(doc.edited_at && Date.now() - Date.parse(doc.edited_at) < 60000)) {
    return res.json({ ok: true, skipped: 'background update' })
  }

  try {
    const group = await databases.getDocument(DB, 'groups', doc.group_id)
    const mems = (await teams.listMemberships(group.team_id, [Query.limit(100)])).memberships
    const actorId = req.headers['x-appwrite-user-id'] || doc.created_by
    const nameOf = id => mems.find(m => m.userId === id)?.userName || 'Someone'
    const recipients = mems.map(m => m.userId).filter(id => id && id !== actorId)
    if (!recipients.length) return res.json({ ok: true, sent: 0 })


    // Splits are written just after the expense; wait briefly so each person sees their own share.
    let shares = {}
    if (kind !== 'deleted') {
      await sleep(2500)
      const sp = await databases.listDocuments(DB, 'splits', [Query.equal('expense_id', doc.$id), Query.limit(100)])
      sp.documents.forEach(s => { shares[s.member_id] = (shares[s.member_id] || 0) + s.owed_cents })
    }

    const cur = group.currency || '$'
    const { sent, devices } = await pushTo(recipients, sub => {
      const share = shares[sub.user_id]
      const tail = kind !== 'deleted' && share ? ` · your share ${money(share, cur)}` : ''
      return {
        title: `SplitIt · ${group.name}`,
        body: `${nameOf(actorId)} ${kind} “${doc.description}” · ${money(doc.amount_cents, cur)}${tail}`,
        url: `/?group=${group.$id}`,
        tag: doc.$id,
      }
    })
    log(`${kind} ${doc.$id}: sent ${sent}/${devices}`)
    return res.json({ ok: true, sent })
  } catch (e) {
    error(e.message)
    return res.json({ ok: false, error: e.message }, 500)
  }
}
