// Appwrite Function: push notifications for SplitIt.
// 1) Database events on expenses: tell the rest of the group about adds / edits / deletes.
// 2) Called by a signed-in user with { action: 'remind', groupId, toUserId, amount }: nudge one person to pay.
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
    const subs = (await databases.listDocuments(DB, 'push_subs', [Query.equal('user_id', userIds), Query.limit(500)])).documents
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

  // ---- 1) expense added / edited / deleted ----
  const event = String(req.headers['x-appwrite-event'] || '')
  const kind = event.endsWith('.create') ? 'added' : event.endsWith('.delete') ? 'deleted' : event.endsWith('.update') ? 'edited' : ''
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
