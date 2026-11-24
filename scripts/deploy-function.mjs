// Deploys the join-by-code Appwrite Function from functions/join-by-code.
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
const FID = 'join-by-code'
if (!endpoint || !project || !key) { console.error('Missing env'); process.exit(1) }

const fns = new Functions(new Client().setEndpoint(endpoint).setProject(project).setKey(key))

async function ensureFunction() {
  try { await fns.get(FID); console.log('function exists') }
  catch {
    await fns.create(FID, 'Join by code', 'node-18.0', ['users'], [], '', 15, true, true, 'src/main.js', 'npm install')
    console.log('function created')
  }
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
  await setVar('APPWRITE_API_KEY', key)
  await setVar('APP_DB_ID', DB)

  if (existsSync('code.tar.gz')) rmSync('code.tar.gz')
  execSync('tar -czf code.tar.gz -C functions/join-by-code .', { stdio: 'inherit' })
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
