// Appwrite Function: add the signed-in caller to a group's team, given its join code.
// Runs with a server API key (set as the APPWRITE_API_KEY function variable).
import { Client, Databases, Teams, Query } from 'node-appwrite'

export default async ({ req, res, log, error }) => {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT
  const project = process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID
  const key = process.env.APPWRITE_API_KEY
  const DB = process.env.APP_DB_ID || 'splitit'

  const client = new Client().setEndpoint(endpoint).setProject(project).setKey(key)
  const databases = new Databases(client)
  const teams = new Teams(client)

  const userId = req.headers['x-appwrite-user-id']
  if (!userId) return res.json({ ok: false, error: 'Please sign in first' }, 401)

  let body = {}
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}) } catch { /* ignore */ }

  // Appwrite Cloud hides other members' userId from client SDKs (no Console switch for it).
  // Return membershipId -> userId for a team, but only to someone who is in that team.
  if (body.action === 'members') {
    const teamId = String(body.teamId || '')
    if (!teamId) return res.json({ ok: false, error: 'Missing team' }, 400)
    try {
      const mine = await teams.listMemberships(teamId, [Query.equal('userId', userId), Query.limit(1)])
      if (!mine.total) return res.json({ ok: false, error: 'Not a member of this group' }, 403)
      const all = await teams.listMemberships(teamId, [Query.limit(100)])
      return res.json({ ok: true, members: all.memberships.map(m => ({ membership_id: m.$id, user_id: m.userId })) })
    } catch (e) {
      error(e.message)
      return res.json({ ok: false, error: 'Could not load members' }, 500)
    }
  }

  const code = String(body.code || '').trim().toUpperCase()
  const name = String(body.name || 'Member').slice(0, 128)
  if (!code) return res.json({ ok: false, error: 'Enter a code' }, 400)

  try {
    const found = await databases.listDocuments(DB, 'groups', [Query.equal('join_code', code), Query.limit(1)])
    if (!found.total) return res.json({ ok: false, error: 'No group with that code' }, 404)
    const group = found.documents[0]

    // already a member? then just return the group
    const mems = await teams.listMemberships(group.team_id, [Query.equal('userId', userId), Query.limit(1)])
    if (mems.total) return res.json({ ok: true, groupId: group.$id })

    // add the user directly (server-side membership, no email needed)
    await teams.createMembership(group.team_id, ['member'], undefined, userId, undefined, undefined, name)
    return res.json({ ok: true, groupId: group.$id })
  } catch (e) {
    error(e.message)
    return res.json({ ok: false, error: e.message || 'Could not join' }, 500)
  }
}
