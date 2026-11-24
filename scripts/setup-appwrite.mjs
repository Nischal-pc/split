// One-shot Appwrite provisioner. Creates the database, collections, attributes,
// indexes and permissions so you never touch the Appwrite console's database UI.
//
// Usage:
//   1) Create a project at https://cloud.appwrite.io (or your self-hosted instance).
//   2) Project Settings -> fill .env: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID
//   3) Create an API key (Overview -> Integrations/API keys) with scopes:
//        databases.read, databases.write, collections.read, collections.write,
//        attributes.read, attributes.write, indexes.read, indexes.write
//      Put it in .env as APPWRITE_API_KEY=...
//   4) npm install  &&  npm run setup
//
import 'dotenv/config'
import { Client, Databases, Permission, Role, IndexType } from 'node-appwrite'

const endpoint = process.env.VITE_APPWRITE_ENDPOINT
const project = process.env.VITE_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY
const DB = process.env.VITE_APPWRITE_DB_ID || 'splitit'

if (!endpoint || !project || !apiKey) {
  console.error('Missing env. Need VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID and APPWRITE_API_KEY in .env')
  process.exit(1)
}

const db = new Databases(new Client().setEndpoint(endpoint).setProject(project).setKey(apiKey))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ok409 = async (label, fn) => { try { await fn(); console.log('  +', label) } catch (e) { if (e.code === 409) console.log('  =', label, '(exists)'); else throw e } }

// collection definitions: [id, [ [kind,key,...args], ... ], [ indexAttr, ... ] ]
const S = (key, size = 64, req = true) => ['s', key, size, req]
const I = (key, req = true) => ['i', key, req]
const collections = {
  groups: { attrs: [S('name', 128), S('currency', 8), S('team_id'), S('created_by')], idx: ['team_id'] },
  expenses: { attrs: [S('group_id'), S('description', 256), I('amount_cents'), S('paid_by'), S('category', 32), S('spent_on', 16), S('created_by')], idx: ['group_id'] },
  splits: { attrs: [S('expense_id'), S('group_id'), S('member_id'), I('owed_cents')], idx: ['expense_id', 'group_id'] },
  settlements: { attrs: [S('group_id'), S('from_member'), S('to_member'), I('amount_cents')], idx: ['group_id'] },
  messages: { attrs: [S('group_id'), S('user_id'), S('display_name', 128), S('body', 2000)], idx: ['group_id'] },
  activity: { attrs: [S('group_id'), S('actor_name', 128), S('text', 512)], idx: ['group_id'] },
  comments: { attrs: [S('group_id'), S('expense_id'), S('user_id'), S('display_name', 128), S('body', 1000)], idx: ['expense_id', 'group_id'] },
}

async function waitAvailable(col) {
  for (let i = 0; i < 40; i++) {
    const { attributes } = await db.listAttributes(DB, col)
    if (attributes.length && attributes.every(a => a.status === 'available')) return
    await sleep(1000)
  }
  console.warn('  ! attributes still processing for', col, '— indexes may need a re-run')
}

async function main() {
  console.log('Database:', DB)
  await ok409('database ' + DB, () => db.create(DB, 'SplitIt'))

  for (const [id, def] of Object.entries(collections)) {
    console.log('\nCollection:', id)
    // documentSecurity=true so per-document team permissions govern read/update/delete;
    // any signed-in user may create (then the doc is locked to its group's team).
    await ok409('collection', () => db.createCollection(DB, id, id, [Permission.create(Role.users())], true))
    for (const [kind, key, a, b] of def.attrs) {
      if (kind === 's') await ok409('attr ' + key, () => db.createStringAttribute(DB, id, key, a, b))
      else await ok409('attr ' + key, () => db.createIntegerAttribute(DB, id, key, b /* required */))
    }
    await waitAvailable(id)
    for (const key of def.idx) {
      await ok409('index ' + key, () => db.createIndex(DB, id, 'by_' + key, IndexType.Key, [key]))
    }
  }
  console.log('\nDone. Your Appwrite backend is ready. Run: npm run dev')
}
main().catch(e => { console.error('\nFailed:', e.message || e); process.exit(1) })
