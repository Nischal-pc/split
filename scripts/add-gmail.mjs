// Adds (or updates) Gmail as the email sender in Appwrite Messaging, so reminder emails work.
// Reads GMAIL_ADDRESS and GMAIL_APP_PASSWORD from .env (never commit those). Usage: npm run add:gmail
import 'dotenv/config'
import { Client, Messaging, SmtpEncryption } from 'node-appwrite'

const { VITE_APPWRITE_ENDPOINT: endpoint, VITE_APPWRITE_PROJECT_ID: project, APPWRITE_API_KEY: key } = process.env
const address = (process.env.GMAIL_ADDRESS || '').trim()
const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '') // Google shows it in groups of 4
if (!endpoint || !project || !key) { console.error('Missing Appwrite settings in .env'); process.exit(1) }
if (!address.includes('@') || pass.length !== 16) {
  console.error('Put these two lines in .env first (App Password is 16 letters):\n  GMAIL_ADDRESS=you@gmail.com\n  GMAIL_APP_PASSWORD=abcdabcdabcdabcd')
  process.exit(1)
}

const m = new Messaging(new Client().setEndpoint(endpoint).setProject(project).setKey(key))
const ID = 'gmail'
const args = ['Gmail', 'smtp.gmail.com', 587, address, pass, SmtpEncryption.Tls, true, undefined, 'SplitIt', address, 'SplitIt', address, true]
try {
  try { await m.getProvider(ID); await m.updateSmtpProvider(ID, ...args); console.log('✅ Gmail sender updated') }
  catch (e) { if (e.code !== 404) throw e; await m.createSmtpProvider(ID, ...args); console.log('✅ Gmail sender added') }
  console.log('   Emails will come from', address)
} catch (e) {
  console.error('Failed:', e.message)
  if (e.code === 401) console.error('Your Appwrite API key needs the "providers.write" permission (Appwrite → Overview → API keys).')
  process.exit(1)
}
