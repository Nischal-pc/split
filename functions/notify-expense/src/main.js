// Appwrite Function: push a notification to the rest of the group when an expense is
// added, edited or deleted. Triggered by database events on the expenses collection.
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

  const event = String(req.headers['x-appwrite-event'] || '')
  const kind = event.endsWith('.create') ? 'added' : event.endsWith('.delete') ? 'deleted' : event.endsWith('.update') ? 'edited' : ''
  let doc = req.body
  if (typeof doc === 'string') { try { doc = JSON.parse(doc) } catch { doc = {} } }
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

    const subs = (await databases.listDocuments(DB, 'push_subs', [Query.equal('user_id', recipients), Query.limit(500)])).documents
    if (!subs.length) return res.json({ ok: true, sent: 0, note: 'nobody in the group has notifications on' })

    // Splits are written just after the expense; wait briefly so each person sees their own share.
    let shares = {}
    if (kind !== 'deleted') {
      await sleep(2500)
      const sp = await databases.listDocuments(DB, 'splits', [Query.equal('expense_id', doc.$id), Query.limit(100)])
      sp.documents.forEach(s => { shares[s.member_id] = (shares[s.member_id] || 0) + s.owed_cents })
    }

    const cur = group.currency || '$'
    let sent = 0
    await Promise.all(subs.map(async s => {
      const share = shares[s.user_id]
      const tail = kind !== 'deleted' && share ? ` · your share ${money(share, cur)}` : ''
      const payload = JSON.stringify({
        title: `SplitIt · ${group.name}`,
        body: `${nameOf(actorId)} ${kind} “${doc.description}” · ${money(doc.amount_cents, cur)}${tail}`,
        url: `/?group=${group.$id}`,
        tag: doc.$id,
      })
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 }); sent++ }
      catch (e) {
        // 404/410: the phone unsubscribed or the app was removed; forget this device.
        if (e.statusCode === 404 || e.statusCode === 410) await databases.deleteDocument(DB, 'push_subs', s.$id).catch(() => {})
        else error(`push failed (${e.statusCode}): ${e.body || e.message}`)
      }
    }))
    log(`${kind} ${doc.$id}: sent ${sent}/${subs.length}`)
    return res.json({ ok: true, sent })
  } catch (e) {
    error(e.message)
    return res.json({ ok: false, error: e.message }, 500)
  }
}
