// Deploys an Appwrite Function from functions/<id> (join-by-code or notify-expense).
// Needs the API key in .env to also have: functions.read/write, and (at runtime,
// used by the function) teams.read/write + databases.read + documents.read.
import 'dotenv/config'
import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { Client, Functions } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'

const endpoint = process.env.VITE_APPWRITE_ENDPOINT
const project = process.env.VITE_APPWRITE_PROJECT_ID
const key = process.env.APPWRITE_API_KEY
const DB = process.env.VITE_APPWRITE_DB_ID || 'splitit'
if (!endpoint || !project || !key) { console.error('Missing env'); process.exit(1) }

// Usage: npm run deploy:fn [join-by-code | notify-expense]   (default: join-by-code)
const FUNCTIONS = {
  'join-by-code': { name: 'Join by code', execute: ['users'], events: [], vars: { APPWRITE_API_KEY: key, APP_DB_ID: DB } },
  // Runs on expense changes, and signed-in users can call it for reminders (it checks group membership).
  'notify-expense': {
    name: 'Notify group of changes', execute: ['users'],
    interval: 1440, // daily (free plan has no cron); the function only sends the monthly recap on the 1st
    events: [
      ...['create', 'update', 'delete'].map(e => `databases.${DB}.collections.expenses.documents.*.${e}`),
      ...['settlements', 'messages', 'comments'].map(c => `databases.${DB}.collections.${c}.documents.*.create`),
      'teams.*.memberships.*.create', 'teams.*.memberships.*.delete',
    ],
    vars: { APPWRITE_API_KEY: key, APP_DB_ID: DB, VAPID_PUBLIC_KEY: process.env.VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'https://split-lake-tau.vercel.app' },
  },
}
const FID = process.argv[2] || 'join-by-code'
const CFG = FUNCTIONS[FID]
if (!CFG) { console.error('Unknown function', FID); process.exit(1) }
if (Object.values(CFG.vars).some(v => !v)) { console.error('Missing env for', FID, '— run: npx web-push generate-vapid-keys, see .env.example'); process.exit(1) }

const fns = new Functions(new Client().setEndpoint(endpoint).setProject(project).setKey(key))

async function ensureFunction() {
  try {
    await fns.get(FID)
    await fns.update(FID, CFG.name, 'node-18.0', CFG.execute, CFG.events, '', 30, true, true, 'src/main.js', 'npm install')
    console.log('function exists (settings updated)')
  } catch (e) {
    if (e.code !== 404) throw e
    await fns.create(FID, CFG.name, 'node-18.0', CFG.execute, CFG.events, '', 30, true, true, 'src/main.js', 'npm install')
    console.log('function created')
  }
  if (CFG.interval) await setInterval_(CFG.interval)
}
// Free-plan schedules are intervals in minutes; the installed SDK predates them, so call the REST API directly.
async function setInterval_(minutes) {
  const r = await fetch(`${endpoint}/functions/${FID}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': project, 'X-Appwrite-Key': key },
    body: JSON.stringify({ name: CFG.name, runtime: 'node-18.0', execute: CFG.execute, events: CFG.events, interval: minutes, timeout: 30, enabled: true, logging: true, entrypoint: 'src/main.js', commands: 'npm install' }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error('could not set interval: ' + (j.message || r.status))
  console.log('schedule: every', j.interval ?? minutes, 'minutes')
}
async function setVar(k, v) {
  const list = await fns.listVariables(FID)
  const ex = list.variables.find(x => x.key === k)
  if (ex) await fns.updateVariable(FID, ex.$id, k, v)
  else await fns.createVariable(FID, k, v)
  console.log('variable', k, 'set')
}

async function main() {
  await ensureFunction()
  for (const [k, v] of Object.entries(CFG.vars)) await setVar(k, v)

  if (existsSync('code.tar.gz')) rmSync('code.tar.gz')
  execSync(`tar -czf code.tar.gz -C functions/${FID} .`, { stdio: 'inherit' })
  console.log('packaged code.tar.gz')

  const dep = await fns.createDeployment(FID, InputFile.fromPath('code.tar.gz', 'code.tar.gz'), true)
  console.log('deployment', dep.$id, '->', dep.status)

  for (let i = 0; i < 80; i++) {
    const d = await fns.getDeployment(FID, dep.$id)
    if (d.status === 'ready') { console.log('\n✅ READY — function deployed'); rmSync('code.tar.gz'); return }
    if (d.status === 'failed') { console.log('\n❌ BUILD FAILED:\n', (d.buildLogs || '').slice(-1500)); process.exit(1) }
    process.stdout.write(`\r  building… ${d.status} (${i * 3}s)`)
    await new Promise(r => setTimeout(r, 3000))
  }
  console.log('\n⏱ still building — check Appwrite console')
}
main().catch(e => { console.error('\nFailed:', e.message || e); process.exit(1) })
