// Adds (or updates) the email sender in Appwrite Messaging so reminder emails work.
// Usage: npm run add:brevo   (or npm run add:gmail)
// Reads the login details from .env — never commit those:
//   Brevo: BREVO_SMTP_LOGIN (looks like 1234abc@smtp-brevo.com), BREVO_SMTP_KEY (starts xsmtpsib-), SENDER_EMAIL (verified in Brevo)
//   Gmail: GMAIL_ADDRESS, GMAIL_APP_PASSWORD (16 letters)
import 'dotenv/config'
import { Client, Messaging, SmtpEncryption } from 'node-appwrite'

const env = k => (process.env[k] || '').trim()
const which = process.argv[2] || 'brevo'
const PRESETS = {
  brevo: () => ({ host: 'smtp-relay.brevo.com', user: env('BREVO_SMTP_LOGIN'), pass: env('BREVO_SMTP_KEY'), from: env('SENDER_EMAIL'),
    ok: () => env('BREVO_SMTP_LOGIN').includes('@') && env('BREVO_SMTP_KEY').length > 20 && env('SENDER_EMAIL').includes('@'),
    help: 'BREVO_SMTP_LOGIN=1234abc@smtp-brevo.com\n  BREVO_SMTP_KEY=xsmtpsib-...\n  SENDER_EMAIL=the email you verified in Brevo' }),
  gmail: () => ({ host: 'smtp.gmail.com', user: env('GMAIL_ADDRESS'), pass: env('GMAIL_APP_PASSWORD').replace(/\s+/g, ''), from: env('GMAIL_ADDRESS'),
    ok: () => env('GMAIL_ADDRESS').includes('@') && env('GMAIL_APP_PASSWORD').replace(/\s+/g, '').length === 16,
    help: 'GMAIL_ADDRESS=you@gmail.com\n  GMAIL_APP_PASSWORD=abcdabcdabcdabcd' }),
}
if (!PRESETS[which]) { console.error('Use: npm run add:brevo  or  npm run add:gmail'); process.exit(1) }
const cfg = PRESETS[which]()
if (!env('VITE_APPWRITE_ENDPOINT') || !env('VITE_APPWRITE_PROJECT_ID') || !env('APPWRITE_API_KEY')) { console.error('Missing Appwrite settings in .env'); process.exit(1) }
if (!cfg.ok()) { console.error(`Put these lines in .env first:\n  ${cfg.help}`); process.exit(1) }

const m = new Messaging(new Client().setEndpoint(env('VITE_APPWRITE_ENDPOINT')).setProject(env('VITE_APPWRITE_PROJECT_ID')).setKey(env('APPWRITE_API_KEY')))
const ID = 'email-sender'
const name = which === 'brevo' ? 'Brevo' : 'Gmail'
const args = [name, cfg.host, 587, cfg.user, cfg.pass, SmtpEncryption.Tls, true, undefined, 'SplitIt', cfg.from, 'SplitIt', cfg.from, true]
try {
  try { await m.getProvider(ID); await m.updateSmtpProvider(ID, ...args); console.log(`✅ ${name} email sender updated`) }
  catch (e) { if (e.code !== 404) throw e; await m.createSmtpProvider(ID, ...args); console.log(`✅ ${name} email sender added`) }
  console.log('   Reminder emails will come from', cfg.from)
} catch (e) {
  console.error('Failed:', e.message)
  if (e.code === 401) console.error('Your Appwrite API key needs the "providers.write" permission (Appwrite → Overview → API keys).')
  process.exit(1)
}
