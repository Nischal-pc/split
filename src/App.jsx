import React, { useEffect, useRef, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, AreaChart, Area, CartesianGrid } from 'recharts'
import * as db from './db.js'
import { allocate, computeNets, simplify, splitsFromDraft, toCents, money, parseReceipt, parseReceiptItems, itemSplit, nextDate, filterExpenses, CURRENCIES, guessCode, convertCents, monthOf, shiftMonth, inMonth, sumCents } from './split.js'

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
  </svg>
)

const CATS = { general: '🧾', food: '🍽️', transport: '🚕', home: '🏠', trip: '✈️', fun: '🎉', shopping: '🛍️' }
const COLORS = ['#2f7d4f', '#c0492f', '#2b6fb0', '#9a5bbf', '#b8791f', '#1f998f', '#c0497f', '#5a6b2f']
const nameOf = (members, id) => members.find(m => m.user_id === id)?.display_name || '?'
const colorOf = (members, id) => COLORS[Math.max(0, members.findIndex(m => m.user_id === id)) % COLORS.length]
const displayName = user => user.name || user.email

/* drawn icons (one consistent 1.9 stroke) */
const Svg = p => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p} />
const Ic = {
  moon: () => <Svg><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Svg>,
  logout: () => <Svg><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Svg>,
  back: () => <Svg width="18" height="18"><path d="M15 18l-6-6 6-6" /></Svg>,
  close: () => <Svg><path d="M18 6 6 18M6 6l12 12" /></Svg>,
  send: () => <Svg width="18" height="18"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></Svg>,
  chev: () => <Svg><path d="M9 18l6-6-6-6" /></Svg>,
  alert: () => <Svg width="16" height="16"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></Svg>,
  trash: () => <Svg width="17" height="17"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></Svg>,
  edit: () => <Svg width="16" height="16"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></Svg>,
  exit: () => <Svg width="17" height="17"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></Svg>,
  download: () => <Svg width="17" height="17"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5M12 15V3" /></Svg>,
  camera: () => <Svg width="18" height="18"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></Svg>,
  copy: () => <Svg width="15" height="15"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>,
  check: () => <Svg width="15" height="15"><path d="M20 6 9 17l-5-5" /></Svg>,
  home: () => <Svg><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></Svg>,
  pulse: () => <Svg><path d="M3 12h4l3 8 4-16 3 8h4" /></Svg>,
  user: () => <Svg><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></Svg>,
  share: () => <Svg width="17" height="17"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4M12 2v13" /></Svg>,
  bell: () => <Svg><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Svg>,
  bank: () => <Svg><path d="M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3l9 5H3z" /></Svg>,
  plus: () => <Svg><path d="M12 5v14M5 12h14" /></Svg>,
  userPlus: () => <Svg><circle cx="10" cy="8" r="4" /><path d="M2 21c0-4 4-6 8-6s8 2 8 6M19 4v6M16 7h6" /></Svg>,
  ticket: () => <Svg><path d="M3 9a3 3 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a3 3 0 0 1 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" /><path d="M14 5v14" strokeDasharray="2 2" /></Svg>,
}
// Google sign-in needs a Google Cloud OAuth client set in Appwrite (Auth → Settings → Google).
// Hidden until then; set VITE_GOOGLE_SIGNIN=on (in .env and Vercel) to show the button.
const GOOGLE_SIGNIN = import.meta.env.VITE_GOOGLE_SIGNIN === 'on'

// [mode, tab label, one-line explanation]
const SPLIT_MODES = [
  ['equal', 'Equally', 'Everyone ticked pays the same. Tap a person to leave them out.'],
  ['exact', 'Amounts', 'Type exactly how much each person owes.'],
  ['percent', 'Percent', 'Give each person a share of the total, in %.'],
  ['shares', 'Shares', 'Someone with 2 shares pays twice as much as someone with 1.'],
  ['items', 'Items', 'Add each item and tap who had it. Tax and tip are shared in proportion.'],
]
// Splitwise-style one-tap choices: [id, title, detail]. `group` = more than one other person.
function quickOptions({ name, n, amt, cur, group }) {
  const each = money(Math.round(amt / n), cur), full = money(amt, cur), has = amt > 0
  return [
    ['iPaidEqual', 'You paid, split equally', has && (group ? `${each} each — everyone owes you their share` : `${name} owes you ${each}`)],
    ['theyOweFull', `You paid, ${name} owes you everything`, has && `${name} owes you ${full}`],
    ['theyPaidEqual', `${name} paid, split equally`, has && `You owe ${name} ${each}`],
    ['iOweFull', `${name} paid, you owe everything`, has && `You owe ${name} ${full}`],
    ['custom', 'Something else', 'Different amounts, percentages, shares or payer'],
  ]
}
// Time-of-day greeting for the Home header.
function greeting(h = new Date().getHours()) {
  if (h >= 5 && h < 12) return { text: 'Good morning', emoji: '☀️' }
  if (h >= 12 && h < 17) return { text: 'Good afternoon', emoji: '🌤️' }
  if (h >= 17 && h < 21) return { text: 'Good evening', emoji: '🌆' }
  return { text: 'Good night', emoji: '🌙' }
}
const todayISO = () => new Date().toISOString().slice(0, 10)
const fmtDate = d => d ? new Date(d + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

export default function App() {
  const [user, setUser] = useState(undefined)
  const [groupId, setGroupId] = useState(null)
  const [recovery, setRecovery] = useState(null)

  async function boot() {
    const rec = db.recoveryFromUrl()
    if (rec) { setRecovery(rec); db.clearUrlParams(); setUser(await db.getUser()); return }
    await db.acceptInviteFromUrl().catch(() => {})
    setUser(await db.getUser())
  }
  useEffect(() => {
    // ?join=CODE invite links: remember the code through sign-up / log-in, then join.
    const q = new URLSearchParams(window.location.search)
    const code = q.get('join'), open = q.get('group') // ?group= comes from tapping a notification
    const recap = /^\d{4}-\d{2}$/.test(q.get('recap') || '') && q.get('recap') // ?recap= from the monthly recap notification
    if (code) sessionStorage.setItem('splitit.join', code.trim().toUpperCase())
    if (open) sessionStorage.setItem('splitit.open', open)
    if (recap) sessionStorage.setItem('splitit.recap', recap)
    if (code || open || recap) db.clearUrlParams()
    boot()
  }, [])
  const [joinErr, setJoinErr] = useState('')
  useEffect(() => {
    const open = user && sessionStorage.getItem('splitit.open')
    if (open) { sessionStorage.removeItem('splitit.open'); setGroupId(open) }
    const code = user && sessionStorage.getItem('splitit.join')
    if (!code) return
    sessionStorage.removeItem('splitit.join')
    db.joinByCode(code, displayName(user)).then(setGroupId).catch(e => setJoinErr(e.message || 'That invite link didn’t work'))
  }, [user])
  useEffect(() => {
    if (!user) return
    db.flushOutbox()
    window.addEventListener('online', db.flushOutbox)
    return () => window.removeEventListener('online', db.flushOutbox)
  }, [user])
  const onAuthed = async () => { await db.acceptInviteFromUrl().catch(() => {}); setUser(await db.getUser()) }

  const signOut = async () => { await db.signOut(); setGroupId(null); setUser(null) }

  if (user === undefined) return <div className="center">Loading…</div>
  if (recovery) return <ResetPassword rec={recovery} onDone={() => setRecovery(null)} />
  if (!user) return <Auth onAuthed={onAuthed} />
  if (groupId) return <GroupView groupId={groupId} user={user} onBack={() => setGroupId(null)} />
  return <>
    <Shell user={user} onOpen={setGroupId} onSignOut={signOut} />
    {joinErr && <Toast text={joinErr} tone="bad" onDone={() => setJoinErr('')} />}
  </>
}

// Thin bar at the top while the device has no connection.
export function OfflineBar() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  if (online) return null
  return <div className="offbar" role="status">You’re offline · showing saved data. New expenses will sync later.</div>
}

// Short-lived message above the bottom bar, with an optional action (e.g. Undo).
function Toast({ text, action, onAction, onDone, ms = 7000, tone = '' }) {
  useEffect(() => { const t = setTimeout(onDone, ms); return () => clearTimeout(t) }, [text])
  return (
    <div className={'toast ' + tone} role="status">
      <span>{text}</span>
      {action && <button onClick={onAction}>{action}</button>}
    </div>
  )
}

/* ---------------- Shell with bottom-tab navigation ---------------- */
function Shell({ user, onOpen, onSignOut }) {
  const [tab, setTab] = useState('home')
  return (
    <>
      {tab === 'home' && <HomeTab user={user} onOpen={onOpen} onAccount={() => setTab('account')} />}
      {tab === 'activity' && <GlobalActivity user={user} />}
      {tab === 'account' && <AccountTab user={user} onSignOut={onSignOut} />}
      <nav className="tabbar">
        {[['home', 'Home', Ic.home], ['activity', 'Activity', Ic.pulse], ['account', 'Account', Ic.user]].map(([id, label, Icon]) => (
          <button key={id} className={'tabitem' + (tab === id ? ' on' : '')} aria-selected={tab === id} onClick={() => setTab(id)}>
            <Icon /><span>{label}</span>
          </button>
        ))}
      </nav>
    </>
  )
}

function GlobalActivity({ user }) {
  const [items, setItems] = useState(null)
  const [names, setNames] = useState({})
  useEffect(() => { (async () => {
    const [act, groups] = await Promise.all([db.listRecentActivity(40).catch(() => []), db.listGroups(user.id).catch(() => [])])
    setNames(Object.fromEntries(groups.map(g => [g.id, g.name]))); setItems(act)
  })() }, [])
  return (
    <main className="wrap">
      <div className="home-hero"><div className="greet">Activity</div><div className="sublabel muted">across all your groups</div></div>
      {items === null ? <div className="muted pad">Loading…</div>
        : items.length === 0 ? <div className="empty"><div className="big">📋</div>Nothing yet.<br />Add an expense or settle up to see activity here.</div>
          : <div className="card list">
            {items.map(a => (
              <div className="row" key={a.id}>
                <div className="grow"><b>{a.actor_name}</b> <span className="muted">{a.text}</span>{names[a.group_id] && <span className="faint tiny"> · {names[a.group_id]}</span>}</div>
                <div className="tiny faint" style={{ flex: 'none' }}>{timeAgo(a.created_at)}</div>
              </div>
            ))}
          </div>}
    </main>
  )
}

// Canadian banks for "Pay with my bank". There is no public Interac deep link with a pre-filled amount,
// so we copy the recipient's email and open the bank's site (phones hand off to the bank app if installed).
const BANKS = [
  ['rbc', 'RBC Royal Bank', 'https://www.rbcroyalbank.com'], ['td', 'TD', 'https://www.td.com'],
  ['scotia', 'Scotiabank', 'https://www.scotiabank.com/ca/en/personal.html'], ['bmo', 'BMO', 'https://www.bmo.com'],
  ['cibc', 'CIBC', 'https://www.cibc.com'], ['nbc', 'National Bank', 'https://www.nbc.ca'], ['desjardins', 'Desjardins', 'https://www.desjardins.com'],
  ['tangerine', 'Tangerine', 'https://www.tangerine.ca'], ['simplii', 'Simplii', 'https://www.simplii.com'], ['eq', 'EQ Bank', 'https://www.eqbank.ca'],
  ['wealthsimple', 'Wealthsimple', 'https://www.wealthsimple.com'], ['koho', 'KOHO', 'https://www.koho.ca'], ['atb', 'ATB', 'https://www.atb.com'],
  ['pc', 'PC Financial', 'https://www.pcfinancial.ca'], ['laurentian', 'Laurentian Bank', 'https://www.laurentianbank.ca'],
]
const myBank = () => BANKS.find(b => b[0] === localStorage.getItem('splitit.bank'))
// Account: pick the bank this device pays from.
function BankRow() {
  const [bank, setBank] = useState(localStorage.getItem('splitit.bank') || '')
  const pick = v => { setBank(v); if (v) localStorage.setItem('splitit.bank', v); else localStorage.removeItem('splitit.bank') }
  return (
    <label className="row">
      <Ic.bank />
      <div className="grow">My bank<div className="tiny muted">Used by “Pay with my bank” in Settle up</div></div>
      <select className="chipsel" value={bank} onChange={e => pick(e.target.value)} aria-label="My bank">
        <option value="">Choose…</option>
        {BANKS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
    </label>
  )
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
const PUSH_HINT = {
  unsupported: () => isIOS() ? 'On iPhone: tap Share → Add to Home Screen, then open SplitIt from your Home Screen' : 'This browser can’t show notifications',
  denied: () => 'Blocked. Allow notifications for SplitIt in your phone’s Settings',
  off: () => 'Get notified when someone adds or edits an expense',
  on: () => 'On for this device',
}
// Notifications switch (Account tab).
function PushRow({ user }) {
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { db.pushState().then(setSt).catch(() => setSt('unsupported')) }, [])
  async function flip() {
    setBusy(true); setErr('')
    try { setSt(st === 'on' ? await db.disablePush() : await db.enablePush(user.id)) }
    catch { setErr('Couldn’t turn on notifications in this browser. Try Safari (Home Screen app) or Chrome.') } finally { setBusy(false) }
  }
  if (!st) return null
  const can = st === 'on' || st === 'off'
  return (
    <div className="row">
      <Ic.bell />
      <div className="grow">Notifications<div className="tiny muted">{err || PUSH_HINT[st]()}</div></div>
      {can && <button className={'switch' + (st === 'on' ? ' on' : '')} role="switch" aria-checked={st === 'on'} aria-label="Notifications" disabled={busy} onClick={flip}><span /></button>}
    </div>
  )
}
// One-time nudge on Home while notifications are off.
function PushNudge({ user }) {
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!localStorage.getItem('splitit.pushNudge')) db.pushState().then(setSt).catch(() => {}) }, [])
  const hide = () => { localStorage.setItem('splitit.pushNudge', '1'); setSt(null) }
  if (st !== 'off') return null
  return (
    <div className="nudge">
      <Ic.bell />
      <div className="grow"><b>Know when friends add expenses</b><div className="tiny muted">Get a notification when someone in your groups adds or edits one.</div></div>
      <div className="nudge-actions">
        <button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); try { if (await db.enablePush(user.id) === 'on') hide() } catch { /* ignore */ } setBusy(false) }}>Turn on</button>
        <button className="linkbtn" onClick={hide}>Not now</button>
      </div>
    </div>
  )
}

function AccountTab({ user, onSignOut }) {
  const toggleTheme = () => {
    const cur = document.documentElement.getAttribute('data-theme')
    const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches
    document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark')
  }
  return (
    <main className="wrap">
      <div className="home-hero">
        <div className="acct-avatar">{displayName(user).slice(0, 1).toUpperCase()}</div>
        <div className="bignum" style={{ fontSize: '1.5rem' }}>{displayName(user)}</div>
        <div className="sublabel muted">{user.email}</div>
      </div>
      <div className="card list">
        <PushRow user={user} />
        <BankRow />
        <button className="row rowbtn" onClick={toggleTheme}><Ic.moon /><div className="grow">Toggle light / dark</div><div className="chev"><Ic.chev /></div></button>
        <button className="row rowbtn" onClick={onSignOut}><Ic.logout /><div className="grow">Sign out</div><div className="chev"><Ic.chev /></div></button>
      </div>
    </main>
  )
}

/* ---------------- Auth ---------------- */
function Auth({ onAuthed }) {
  const [mode, setMode] = useState('login') // login | signup | forgot
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const go = m => { setErr(''); setSent(false); setMode(m) }

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      if (mode === 'signup') { await db.signUp(email, pass, name); await onAuthed() }
      else if (mode === 'forgot') { await db.recover(email); setSent(true) }
      else { await db.signIn(email, pass); await onAuthed() }
    } catch (e2) { setErr(e2.message || 'Something went wrong') } finally { setBusy(false) }
  }

  const title = mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'
  const cta = mode === 'signup' ? 'Sign up' : mode === 'forgot' ? 'Email me a reset link' : 'Log in'

  return (
    <div className="authwrap">
      <div className="authhero">
        <div className="logo">S</div>
        <h2>{title}</h2>
        <p>{mode === 'forgot' ? 'We’ll send a link to set a new one.' : 'Split bills with friends, in real time.'}</p>
      </div>
      <div className="authbody">
        {sent ? (
          <>
            <div className="note">Check <b>{email}</b> for a link to set a new password. It can take a minute to arrive.</div>
            <button className="link" onClick={() => go('login')}>Back to log in</button>
          </>
        ) : (
          <>
          {GOOGLE_SIGNIN && mode !== 'forgot' && (
            <>
              <button type="button" className="btn gbtn block" onClick={db.signInWithGoogle}><GoogleG /> Continue with Google</button>
              <div className="divider"><span>or</span></div>
            </>
          )}
          <form onSubmit={submit}>
            {mode === 'signup' && (
              <label className="fld"><span>Your name</span>
                <input className="inp" value={name} onChange={e => setName(e.target.value)} placeholder="Alex" autoComplete="name" /></label>
            )}
            <label className="fld"><span>Email</span>
              <input className="inp" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
            {mode !== 'forgot' && (
              <label className="fld"><span>Password</span>
                <input className="inp" type="password" required minLength={8} value={pass} onChange={e => setPass(e.target.value)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label>
            )}
            {mode === 'login' && (
              <div className="linkrow"><button type="button" onClick={() => go('forgot')}>Forgot password?</button></div>
            )}
            {err && <div className="err"><Ic.alert />{err}</div>}
            <button className="btn block" disabled={busy}>{busy ? 'Please wait…' : cta}</button>
          </form>
          </>
        )}
        {!sent && (
          <button className="link" onClick={() => go(mode === 'signup' ? 'login' : mode === 'forgot' ? 'login' : 'signup')}>
            {mode === 'signup' ? 'Have an account? Log in' : mode === 'forgot' ? 'Back to log in' : 'New here? Create an account'}
          </button>
        )}
      </div>
    </div>
  )
}

function ResetPassword({ rec, onDone }) {
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e) {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await db.confirmRecovery(rec.userId, rec.secret, pass); onDone() }
    catch (e2) { setErr(e2.message || 'Could not reset') } finally { setBusy(false) }
  }
  return (
    <div className="authwrap">
      <div className="authhero"><div className="logo">S</div><h2>Set a new password</h2><p>Almost there.</p></div>
      <div className="authbody">
        <form onSubmit={save}>
          <label className="fld"><span>New password</span>
            <input className="inp" type="password" required minLength={8} value={pass} onChange={e => setPass(e.target.value)} autoComplete="new-password" autoFocus /></label>
          {err && <div className="err"><Ic.alert />{err}</div>}
          <button className="btn block" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
        </form>
      </div>
    </div>
  )
}

/* ---------------- Home ---------------- */
function HomeTab({ user, onOpen, onAccount }) {
  const [groups, setGroups] = useState(null)
  const [spend, setSpend] = useState([]) // your share of each expense
  const [archived, setArchivedIds] = useState([])
  const [month, setMonth] = useState(() => sessionStorage.getItem('splitit.recap') || monthOf(todayISO()))
  const [people, setPeople] = useState(null)
  const [sheet, setSheet] = useState(null) // 'new' | 'join'

  async function load() {
    try { setGroups(await db.listGroups(user.id)) } catch { setGroups([]) }
    try { setSpend(await db.listMySpending(user.id)) } catch { setSpend([]) }
    try { setArchivedIds(await db.getArchived()) } catch { setArchivedIds([]) }
    try { setPeople(await db.listPeople(user.id)) } catch { setPeople([]) }
  }
  useEffect(() => {
    load()
    window.addEventListener('splitit-synced', load)
    return () => window.removeEventListener('splitit-synced', load)
  }, [])

  const first = displayName(user).split(/[\s@]/)[0]
  const gs = groups || []
  const overall = gs.reduce((s, g) => s + g.myNet, 0)
  const owe = gs.reduce((s, g) => s + Math.max(0, -g.myNet), 0)
  const owed = gs.reduce((s, g) => s + Math.max(0, g.myNet), 0)
  const nOwe = gs.filter(g => g.myNet < 0).length, nOwed = gs.filter(g => g.myNet > 0).length
  const currencies = [...new Set(gs.map(g => g.currency))]
  const oneCur = currencies.length === 1 ? currencies[0] : null
  const where = n => n === 0 ? 'nothing outstanding' : `in ${n} ${n === 1 ? 'group' : 'groups'}`
  // Archived groups drop to the bottom, but come back on their own if you owe or are owed again.
  const isShelved = g => archived.includes(g.id) && g.myNet === 0
  const active = gs.filter(g => !isShelved(g)), shelved = gs.filter(isShelved)
  // Spending is shown in one currency: the only one, or the one most of your spending is in.
  const curOf = id => gs.find(g => g.id === id)?.currency
  const spendCur = oneCur || Object.entries(spend.reduce((a, i) => { const c = curOf(i.group_id); if (c) a[c] = (a[c] || 0) + i.amount_cents; return a }, {})).sort((a, b) => b[1] - a[1])[0]?.[0]
  const spendItems = spend.filter(i => curOf(i.group_id) === spendCur)

  return (
    <main className="wrap">
      <section className="dash" aria-label="Your balances">
        <div className="dash-hello">
          <div className="grow">
            <h1 className="hello">{greeting().text}, {first} <span className="wave" aria-hidden="true">{greeting().emoji}</span></h1>
            <div className="dash-date">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          </div>
          <button className="me-btn" onClick={onAccount} aria-label="Your account" title="Your account">{first.slice(0, 1).toUpperCase()}</button>
        </div>
        {groups === null ? <div className="dash-total muted">Loading…</div>
          : !gs.length ? <div className="dash-card dash-empty">
            <div className="dash-label">Total balance</div>
            <div className="dash-total num muted">$0.00</div>
            <p className="dash-sub">Nothing to settle yet. Start a group or add a friend to split your first bill.</p>
          </div>
          : !oneCur ? <>
            <div className="dash-total">Your balances</div>
            <p className="dash-sub">You use more than one currency, so each balance is shown with its group below.</p>
          </>
          : <div className="dash-card">
            <div className="dash-label">Total balance</div>
            <div className={'dash-total num ' + (overall > 0 ? 'pos' : overall < 0 ? 'neg' : '')}>
              {overall === 0 ? 'All settled up' : (overall > 0 ? '+' : '−') + money(Math.abs(overall), oneCur)}</div>
            <p className="dash-sub">{overall === 0 ? 'Nobody owes anybody. Nice.' : overall > 0 ? 'Overall, you are owed money.' : 'Overall, you owe money.'}</p>
            <div className="dash-split">
              <div className="dash-col">
                <div className="dash-k">You owe</div>
                <div className={'dash-v num ' + (owe ? 'neg' : 'muted')}>{money(owe, oneCur)}</div>
                <div className="dash-n">{where(nOwe)}</div>
              </div>
              <div className="dash-col">
                <div className="dash-k">You are owed</div>
                <div className={'dash-v num ' + (owed ? 'pos' : 'muted')}>{money(owed, oneCur)}</div>
                <div className="dash-n">{where(nOwed)}</div>
              </div>
              {owe + owed > 0 && <div className="dash-bar" role="img" aria-label={`You owe ${money(owe, oneCur)}, you are owed ${money(owed, oneCur)}`}>
                <span className="b-neg" style={{ flexGrow: owe }} /><span className="b-pos" style={{ flexGrow: owed }} />
              </div>}
            </div>
          </div>}
      </section>

      <div className="quick">
        <button className="qbtn primary" onClick={() => setSheet('new')}><Ic.plus /><span>New group</span></button>
        <button className="qbtn" onClick={() => setSheet('friend')}><Ic.userPlus /><span>Add friend</span></button>
        <button className="qbtn" onClick={() => setSheet('join')}><Ic.ticket /><span>Join group</span></button>
      </div>
      {gs.length > 0 && <PushNudge user={user} />}

      {people && people.length > 0 && <>
        <div className="eyebrow mt">Balances with people</div>
        <div className="card list" aria-label="What each person owes you or you owe them, across all groups">
          {people.map(p => (
            <div className="row" key={p.user_id + p.cur}>
              <div className="avatar" style={{ background: COLORS[[...p.user_id].reduce((h, c) => h + c.charCodeAt(0), 0) % COLORS.length] }}>{p.name.slice(0, 1).toUpperCase()}</div>
              <div className="grow"><b className="truncate">{p.name}</b>
                <div className="tiny muted truncate">{p.groups.length === 1 ? 'in ' : `across ${p.groups.length} groups · `}{p.groups.join(', ')}</div></div>
              <div className="right">
                <div className="tiny muted">{p.net > 0 ? 'owes you' : 'you owe'}</div>
                <div className={'num ' + (p.net > 0 ? 'pos' : 'neg')}>{money(Math.abs(p.net), p.cur)}</div>
              </div>
            </div>
          ))}
        </div>
      </>}

      {spendCur && spend.length > 0 && <>
        <RecapCard items={spendItems} groups={gs} cur={spendCur} overall={oneCur ? overall : 0} onSee={ym => { setMonth(ym); document.getElementById('spending')?.scrollIntoView({ behavior: 'smooth' }) }} />
        <MonthSpending items={spendItems} groups={gs} cur={spendCur} month={month} setMonth={setMonth} otherCurrencies={currencies.length > 1} />
      </>}

      {groups === null ? <><div className="eyebrow mt">Your groups</div><div className="muted pad">Loading…</div></>
        : <>
          {active.some(g => g.kind === 'friend') && <>
            <div className="eyebrow mt">Friends</div>
            <GroupRows groups={active.filter(g => g.kind === 'friend')} icon="🧑" onOpen={onOpen} />
          </>}
          <div className="eyebrow mt">Your groups</div>
          {active.some(g => g.kind !== 'friend')
            ? <GroupRows groups={active.filter(g => g.kind !== 'friend')} icon="👥" onOpen={onOpen} />
            : <div className="empty"><div className="big">🧾</div>{shelved.length ? 'Nothing active right now.' : <>No groups yet.<br />Create one and invite your friends.</>}</div>}
          {shelved.length > 0 && <details className="archived">
            <summary>Archived ({shelved.length})</summary>
            <GroupRows groups={shelved} icon="🗂️" onOpen={onOpen} />
          </details>}
        </>}

      {sheet === 'new' && <NewGroup user={user} onClose={() => setSheet(null)} onDone={id => { setSheet(null); onOpen(id) }} />}
      {sheet === 'friend' && <AddFriend user={user} onClose={() => setSheet(null)} onDone={id => { setSheet(null); onOpen(id) }} />}
      {sheet === 'add' && <QuickAdd groups={gs} user={user} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load() }} />}
      {gs.length > 0 && !sheet && <button className="fab" onClick={() => setSheet('add')}><Ic.plus /><span>Add expense</span></button>}
      {sheet === 'join' && <JoinGroup user={user} onClose={() => setSheet(null)} onDone={id => { setSheet(null); onOpen(id) }} />}
    </main>
  )
}

// Add an expense from Home: pick the group or friend first (Splitwise's global add button).
function QuickAdd({ groups, user, onClose, onDone }) {
  const [picked, setPicked] = useState(null) // { group, members }
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState('')
  async function pick(id) {
    setBusy(id); setErr('')
    try { const group = await db.getGroup(id); setPicked({ group, members: await db.groupMembers(group) }) }
    catch (e) { setErr(e.message || 'Could not open that group'); setBusy(null) }
  }
  if (picked) return <AddExpense group={picked.group} members={picked.members} user={user} onClose={onDone} />
  const friends = groups.filter(g => g.kind === 'friend'), rest = groups.filter(g => g.kind !== 'friend')
  return (
    <Sheet title="Add expense" onClose={onClose}>
      <p className="split-hint">Who is this expense with?</p>
      {err && <div className="err"><Ic.alert />{err}</div>}
      <div className="card list">
        {[...friends, ...rest].map(g => (
          <button key={g.id} className="row rowbtn" onClick={() => pick(g.id)} disabled={!!busy}>
            <div className="badge">{g.kind === 'friend' ? '🧑' : '👥'}</div>
            <div className="grow"><b className="truncate">{g.name}</b></div>
            <div className="chev">{busy === g.id ? '…' : <Ic.chev />}</div>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

function GroupRows({ groups, icon, onOpen }) {
  return (
    <div className="card list">
      {groups.map(g => (
        <button key={g.id} className="row rowbtn" onClick={() => onOpen(g.id)}>
          <div className="badge">{icon}</div>
          <div className="grow"><b>{g.name}</b>
            <div className={'tiny ' + (g.myNet > 0 ? 'pos' : g.myNet < 0 ? 'neg' : 'muted')}>
              {g.myNet === 0 ? 'settled up' : g.myNet > 0 ? `you are owed ${money(g.myNet, g.currency)}` : `you owe ${money(-g.myNet, g.currency)}`}</div>
          </div>
          <div className="chev"><Ic.chev /></div>
        </button>
      ))}
    </div>
  )
}

// A friend is a 2-person group (kind 'friend'), so splits/balances/settle-up/chat all work unchanged.
function AddFriend({ user, onClose, onDone }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [cur, setCur] = useState('$')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function add() {
    if (!name.trim()) return setErr('Add your friend’s name')
    setBusy(true); setErr('')
    try {
      const id = await db.createGroup(`${displayName(user).split('@')[0]} & ${name.trim()}`, cur.trim() || '$', user.id, 'friend')
      if (email.trim()) {
        const g = await db.getGroup(id)
        await db.inviteByEmail(g.team_id, email.trim())
      }
      onDone(id)
    } catch (e) { setBusy(false); setErr(e.message || 'Could not add friend') }
  }
  return (
    <Sheet title="Add a friend" onClose={onClose}>
      <div className="note">Track expenses with one person, no group needed. Share the invite code or add their email.</div>
      <label className="fld"><span>Friend’s name</span><input className="inp" value={name} onChange={e => setName(e.target.value)} placeholder="Sam" autoFocus /></label>
      <label className="fld"><span>Their email (optional)</span><input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="sam@email.com" /></label>
      <label className="fld"><span>Currency symbol</span><input className="inp" style={{ width: 90 }} value={cur} onChange={e => setCur(e.target.value)} maxLength={3} /></label>
      {err && <div className="err"><Ic.alert />{err}</div>}
      <button className="btn block" onClick={add} disabled={busy}>{busy ? 'Adding…' : 'Add friend'}</button>
    </Sheet>
  )
}

function JoinGroup({ user, onClose, onDone }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function join() {
    if (!code.trim()) return
    setBusy(true); setErr('')
    try { onDone(await db.joinByCode(code.trim(), displayName(user))) }
    catch (e) { setBusy(false); setErr(e.message || 'Could not join') }
  }
  return (
    <Sheet title="Join a group" onClose={onClose}>
      <label className="fld"><span>Invite code</span>
        <input className="inp" style={{ textTransform: 'uppercase', letterSpacing: '.1em' }} value={code} onChange={e => setCode(e.target.value)} placeholder="ABC123" autoFocus /></label>
      {err && <div className="err"><Ic.alert />{err}</div>}
      <button className="btn block" onClick={join} disabled={busy || !code}>{busy ? 'Joining…' : 'Join group'}</button>
    </Sheet>
  )
}

function NewGroup({ user, onClose, onDone }) {
  const [name, setName] = useState('')
  const [cur, setCur] = useState('$')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function create() {
    if (!name.trim()) return
    setBusy(true)
    try { onDone(await db.createGroup(name.trim(), cur.trim() || '$', user.id)) }
    catch (e) { setBusy(false); setErr(e.message || 'Could not create group') }
  }
  return (
    <Sheet title="New group" onClose={onClose}>
      <label className="fld"><span>Group name</span><input className="inp" value={name} onChange={e => setName(e.target.value)} placeholder="Flatmates" autoFocus /></label>
      <label className="fld"><span>Currency symbol</span><input className="inp" style={{ width: 90 }} value={cur} onChange={e => setCur(e.target.value)} maxLength={3} /></label>
      {err && <div className="err"><Ic.alert />{err}</div>}
      <button className="btn block" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create group'}</button>
    </Sheet>
  )
}

/* ---------------- Group view ---------------- */
function GroupView({ groupId, user, onBack }) {
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [data, setData] = useState({ expenses: [], splits: [], settlements: [], activity: [] })
  const [sheet, setSheet] = useState(null)
  const [tab, setTab] = useState('expenses')
  const [reminded, setReminded] = useState({})
  const [undo, setUndo] = useState(null) // { expense, splits } just deleted
  const [pending, setPending] = useState(() => db.pendingFor(groupId))
  const [archived, setArchivedState] = useState(false)
  useEffect(() => { db.getArchived().then(a => setArchivedState(a.includes(groupId))).catch(() => {}) }, [groupId])
  async function toggleArchive() {
    const on = !archived
    setArchivedState(on)
    try { await db.setArchived(groupId, on) } catch { setArchivedState(!on) }
  }
  useEffect(() => {
    const onQ = () => setPending(db.pendingFor(groupId))
    const onSync = () => load().catch(() => {})
    window.addEventListener('splitit-outbox', onQ); window.addEventListener('splitit-synced', onSync)
    return () => { window.removeEventListener('splitit-outbox', onQ); window.removeEventListener('splitit-synced', onSync) }
  }, [groupId])

  // Re-create a just-deleted expense (new id; its comments are not restored).
  async function restore() {
    const { expense: e, splits: sp } = undo
    setUndo(null)
    const extra = {}
    if (e.notes) extra.notes = e.notes
    if (e.orig_cur) { extra.orig_amount = e.orig_amount; extra.orig_cur = e.orig_cur }
    if (e.repeat) { extra.repeat = e.repeat; extra.next_on = e.next_on }
    try {
      await db.addExpense(group, { description: e.description, amount_cents: e.amount_cents, paid_by: e.paid_by, category: e.category, spent_on: e.spent_on,
        owed: Object.fromEntries(sp.map(x => [x.member_id, x.owed_cents])), extra }, user.id)
      logActivity(group, displayName(user), `restored “${e.description}”`)
    } catch { /* ignore */ }
  }

  async function remind(s) {
    const text = `🔔 Reminder: ${nameOf(members, s.from)}, you owe ${nameOf(members, s.to)} ${money(s.amount, group.currency)}. Settle up when you can!`
    try {
      await db.sendMessage(group, user.id, displayName(user), text)
      // also a phone notification (and email if a sender is set up); guests have no account, so chat only
      const real = !db.isGuest(s.from)
      const [pushed, emailed] = await Promise.all([
        real ? db.pushReminder(group.id, s.from, s.amount).catch(() => 0) : 0,
        real ? db.emailReminder(group.id, s.from, s.amount).catch(() => false) : false,
      ])
      const how = [pushed && 'notification', emailed && 'email'].filter(Boolean).join(' + ')
      logActivity(group, displayName(user), `reminded ${nameOf(members, s.from)} to pay ${money(s.amount, group.currency)}${how ? ` (${how})` : ''}`)
      setReminded(r => ({ ...r, [s.from + s.to]: pushed ? 'push' : emailed ? 'email' : 'chat' }))
    } catch { /* ignore */ }
  }

  async function load() {
    const g = await db.getGroup(groupId)
    setGroup(g)
    const [mem, d] = await Promise.all([db.groupMembers(g), db.loadGroupData(groupId)])
    setMembers(mem); setData(d)
  }
  useEffect(() => {
    let unsub = () => {}
    ;(async () => {
      const g = await db.getGroup(groupId)
      g.join_code = g.join_code || await db.ensureJoinCode(g)
      setGroup(g)
      const [mem, d] = await Promise.all([db.groupMembers(g), db.loadGroupData(groupId)])
      setMembers(mem); setData(d)
      // post any due copies of recurring expenses, then reload (we're not subscribed yet)
      const made = await db.runRecurring(g, d.expenses, d.splits, user.id).catch(() => 0)
      if (made) { logActivity(g, 'SplitIt', `added ${made} recurring expense${made > 1 ? 's' : ''}`); await load() }
      unsub = db.subscribeGroup(g.team_id, load)
    })().catch(() => {})
    return () => unsub()
  }, [groupId])

  if (!group) return <main className="wrap"><div className="muted pad">Loading…</div></main>
  const cur = group.currency
  const { expenses, splits, settlements, activity } = data
  const nets = computeNets(members, expenses, splits, settlements)
  const suggestions = simplify(nets)

  return (
    <main className="wrap">
      <button className="back" onClick={onBack}><Ic.back /> Groups</button>
      <div className="ghead">
        <h2>{group.name}</h2>
        <div className="members">{members.map(m => m.display_name + (m.confirmed ? '' : ' (invited)')).join(' · ')}</div>
        <div className="ghead-actions">
          {group.join_code && <CodeChip code={group.join_code} />}
          {group.join_code && <ShareInvite group={group} />}
          <button className="btn ghost sm" onClick={() => setSheet('people')}>Settings</button>
        </div>
      </div>

      {pending.length > 0 && <div className="note syncnote" role="status">
        <b>{pending.length} expense{pending.length > 1 ? 's' : ''} waiting to sync</b> · {pending.map(p => `“${p.payload.description}” ${money(p.payload.amount_cents, group.currency)}`).join(', ')}.
        {' '}{navigator.onLine ? 'Uploading…' : 'It’ll upload when you’re back online.'}</div>}
      {members.some(m => !m.user_id) && <div className="err" role="alert"><Ic.alert />
        <span>Other members are hidden by Appwrite, so balances here can’t be worked out. In Appwrite Console → Auth → Security → Memberships privacy, turn on <b>User ID</b> and <b>Name</b>.</span></div>}
      {expenses.length > 0 && members.every(m => !(nets[m.user_id] || 0)) && <SettledBanner settlements={settlements} members={members} cur={cur} archived={archived} onToggle={toggleArchive} />}
      <MyBalance net={nets[user.id] || 0} cur={cur} />

      <div className="eyebrow">Balances</div>
      <div className="card list">
        {members.map(m => {
          const v = nets[m.user_id] || 0
          return (
            <div className="row" key={m.user_id}>
              <Avatar members={members} id={m.user_id} />
              <div className="grow">{m.display_name}{m.user_id === user.id && ' (you)'}{!m.confirmed && <span className="faint tiny"> · invited</span>}</div>
              <div className={'num ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted')}>{v === 0 ? 'settled' : (v > 0 ? '+' : '') + money(v, cur)}</div>
            </div>
          )
        })}
      </div>

      {suggestions.length > 0 && <>
        <div className="eyebrow mt">Who owes who</div>
        <div className="card list">
          {suggestions.map((s, i) => (
            <div className="row" key={i}>
              <Avatar members={members} id={s.from} />
              <div className="grow"><b>{nameOf(members, s.from)}</b> owes <b>{nameOf(members, s.to)}</b></div>
              <div className="num">{money(s.amount, cur)}</div>
              {s.from !== user.id && <button className="btn ghost sm" title={'Remind ' + nameOf(members, s.from)} disabled={reminded[s.from + s.to]}
                onClick={() => remind(s)}>{{ push: 'Notified ✓', email: 'Emailed ✓', chat: 'Reminded ✓' }[reminded[s.from + s.to]] || '🔔 Remind'}</button>}
              <button className="btn sm" onClick={() => setSheet({ settle: s })}>Settle</button>
            </div>
          ))}
        </div>
      </>}

      <div className="seg mt">
        <button aria-selected={tab === 'expenses'} onClick={() => setTab('expenses')}>Expenses</button>
        <button aria-selected={tab === 'activity'} onClick={() => setTab('activity')}>Activity</button>
        <button aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>Chat</button>
      </div>

      {tab === 'expenses' && <ExpenseList members={members} expenses={expenses} splits={splits} cur={cur} me={user.id} onOpen={e => setSheet({ detail: e })} />}
      {tab === 'activity' && <GroupActivityTab activity={activity} expenses={expenses} settlements={settlements} cur={cur} members={members} />}
      {tab === 'chat' && <Chat group={group} user={user} members={members} />}

      {tab === 'expenses' && (
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setSheet({ settle: null })}>Settle up</button>
          <button className="btn" onClick={() => setSheet('add')}>+ Add expense</button>
        </div>
      )}

      {sheet === 'add' && <AddExpense group={group} members={members} user={user} onClose={() => setSheet(null)} />}
      {sheet === 'people' && <ManagePeople group={group} members={members} nets={nets} user={user} onClose={() => setSheet(null)} onLeave={onBack} onChanged={load} />}
      {sheet && sheet.settle !== undefined && <SettleUp group={group} members={members} user={user} pre={sheet.settle} onClose={() => setSheet(null)} />}
      {sheet && sheet.detail && <ExpenseDetail group={group} members={members} user={user} expense={sheet.detail}
        splits={splits.filter(s => s.expense_id === sheet.detail.id)} onClose={() => setSheet(null)} onEdit={() => setSheet({ edit: sheet.detail })}
        onDeleted={(expense, sp) => setUndo({ expense, splits: sp })} />}
      {undo && <Toast key={undo.expense.id} text={`Deleted “${undo.expense.description}”`} action="Undo" onAction={restore} onDone={() => setUndo(null)} />}
      {sheet && sheet.edit && <AddExpense group={group} members={members} user={user}
        edit={sheet.edit} editSplits={splits.filter(s => s.expense_id === sheet.edit.id)} onClose={() => setSheet(null)} />}
    </main>
  )
}

function MyBalance({ net, cur }) {
  const owed = net > 0, owe = net < 0
  return (
    <div className="mybal">
      <div className="mybal-label">{net === 0 ? 'Your balance' : owed ? 'Overall, you are owed' : 'Overall, you owe'}</div>
      <div className={'bignum num ' + (owed ? 'pos' : owe ? 'neg' : '')}>{net === 0 ? 'All settled' : money(Math.abs(net), cur)}</div>
    </div>
  )
}

function ManagePeople({ group, members, nets, user, onClose, onLeave, onChanged }) {
  const [email, setEmail] = useState('')
  const [guestName, setGuestName] = useState('')
  const [linking, setLinking] = useState(null) // guest id being linked to an account
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const myName = displayName(user)
  const myMembership = members.find(m => m.user_id === user.id)
  // Team owners can delete too: covers groups whose created_by predates the Appwrite migration.
  const isCreator = group.created_by === user.id || !!myMembership?.roles.includes('owner')

  async function invite(e) {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true)
    try { await db.inviteByEmail(group.team_id, email.trim()); setMsg(`Invite sent to ${email.trim()}.`); setEmail('') }
    catch (e2) { setErr(e2.message || 'Could not send invite') } finally { setBusy(false) }
  }
  async function remove(m) {
    setErr('')
    if (m.guest && nets[m.user_id]) return setErr(`${m.display_name} still has a balance. Settle up first, or link them to their account.`)
    try {
      if (m.guest) { await db.removeGuest(group.id, m.user_id); onChanged() }
      else { await db.removeMember(group.team_id, m.membership_id); onClose() }
      logActivity(group, myName, `removed ${m.display_name}`)
    } catch (e2) { setErr(e2.message) }
  }
  async function addGuest(e) {
    e.preventDefault(); const name = guestName.trim(); if (!name) return
    setErr(''); setBusy(true)
    try { await db.addGuest(group.id, name); logActivity(group, myName, `added ${name} (no account)`); setGuestName(''); await onChanged() }
    catch (e2) { setErr(e2.message || 'Could not add them') } finally { setBusy(false) }
  }
  async function link(guest, userId) {
    if (!userId) return
    setErr(''); setBusy(true)
    try {
      await db.mergeGuest(group.id, guest.user_id, userId)
      logActivity(group, myName, `linked ${guest.display_name} to ${nameOf(members, userId)}’s account`)
      setLinking(null); await onChanged()
    } catch (e2) { setErr(e2.message || 'Could not link them') } finally { setBusy(false) }
  }
  const accounts = members.filter(m => !m.guest)
  async function leave() {
    try { await db.leaveGroup(group.team_id, myMembership.membership_id); onLeave() } catch (e2) { setErr(e2.message) }
  }
  async function del() {
    try { await db.deleteGroup(group); onLeave() } catch (e2) { setErr(e2.message) }
  }

  return (
    <Sheet title="People & settings" onClose={onClose}>
      {group.join_code && <>
        <div className="note">Send the invite link, or share this code — people tap “Join group” and type it in.</div>
        <div className="codebig">{group.join_code}</div>
        <ShareInvite group={group} className="btn block" />
      </>}
      <div className="eyebrow mt">Or invite by email</div>
      <div className="note">Appwrite emails them a link to join (works for people who aren’t signed up yet).</div>
      <form onSubmit={invite} style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input className="inp" style={{ flex: 1 }} type="email" required placeholder="friend@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn" disabled={busy || !email}>{busy ? '…' : 'Invite'}</button>
        </div>
      </form>
      {msg && <div className="note mt" style={{ color: 'var(--pos)' }}>{msg}</div>}

      <div className="eyebrow mt">In this group</div>
      <div className="card list">
        {members.map(m => (
          <div className="row" key={m.membership_id}>
            <Avatar members={members} id={m.user_id} />
            <div className="grow">{m.display_name}{m.user_id === user.id && ' (you)'}{!m.confirmed && <span className="faint tiny"> · invited</span>}
              {m.guest && <div className="tiny faint">No account ·{' '}
                {linking === m.user_id
                  ? <select className="chipsel sm" autoFocus aria-label={`Link ${m.display_name} to an account`} defaultValue="" disabled={busy}
                      onChange={e => link(m, e.target.value)} onBlur={() => setLinking(null)}>
                      <option value="" disabled>Who is {m.display_name}?</option>
                      {accounts.map(a => <option key={a.user_id} value={a.user_id}>{a.display_name}</option>)}</select>
                  : <button className="linkbtn" onClick={() => setLinking(m.user_id)}>Link to account</button>}</div>}
            </div>
            {m.user_id !== user.id && <button className="del" title={'Remove ' + m.display_name} onClick={() => remove(m)}><Ic.trash /></button>}
          </div>
        ))}
      </div>

      <form className="guestform" onSubmit={addGuest}>
        <input className="inp" value={guestName} onChange={e => setGuestName(e.target.value)} maxLength={60}
          placeholder="Add someone without an account, e.g. Mom" aria-label="Name of someone without an account" />
        <button className="btn" disabled={busy || !guestName.trim()}>Add</button>
      </form>
      <p className="split-hint">They can be in splits right away. If they sign up later, tap “Link to account” to move their history over.</p>

      {err && <div className="err mt"><Ic.alert />{err}</div>}

      <div className="dangerzone">
        <button className="btn ghost block" onClick={leave}><Ic.exit /> Leave group</button>
        {isCreator && (confirmDel
          ? <button className="btn danger block" onClick={del}>Tap again to permanently delete “{group.name}”</button>
          : <button className="btn ghost block danger-text" onClick={() => setConfirmDel(true)}><Ic.trash /> Delete group</button>)}
        {!isCreator && <div className="note">Only the group owner can delete this group.</div>}
      </div>
    </Sheet>
  )
}

function Avatar({ members, id }) {
  return <div className="avatar" style={{ background: colorOf(members, id) }}>{nameOf(members, id).slice(0, 1).toUpperCase()}</div>
}

// Send the ?join= link through the phone's share sheet (or copy it on desktop).
function ShareInvite({ group, className = 'btn ghost sm' }) {
  const [done, setDone] = useState('')
  async function go() {
    const r = await db.shareText('SplitIt', `Join “${group.name}” on SplitIt so we can split expenses.`, db.inviteLink(group.join_code)).catch(() => null)
    if (r === 'copied') { setDone('Link copied'); setTimeout(() => setDone(''), 1800) }
  }
  return <button className={className + ' withicon'} onClick={go}>{done ? <Ic.check /> : <Ic.share />}{done || 'Share invite link'}</button>
}

function CodeChip({ code }) {
  const [done, setDone] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(code); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* ignore */ } }
  return <button className="codepill" onClick={copy} title="Copy invite code">Code <b>{code}</b> {done ? <Ic.check /> : <Ic.copy />}</button>
}

function ExpenseList({ members, expenses, splits, cur, me, onOpen }) {
  const [f, setF] = useState({ q: '', cat: '', who: '' })
  if (!expenses.length) return <div className="empty">No expenses yet.<br />Tap “Add expense” to start.</div>
  const shown = filterExpenses(expenses, f)
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))
  return (
    <>
    <div className="filters">
      <input className="inp" type="search" aria-label="Search expenses" placeholder="Search expenses…" value={f.q} onChange={set('q')} />
      <div className="two">
        <select className="inp" aria-label="Filter by category" value={f.cat} onChange={set('cat')}>
          <option value="">All categories</option>
          {Object.keys(CATS).map(c => <option key={c} value={c}>{CATS[c]} {c}</option>)}</select>
        <select className="inp" aria-label="Filter by who paid" value={f.who} onChange={set('who')}>
          <option value="">Anyone paid</option>
          {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select>
      </div>
    </div>
    {!shown.length && <div className="empty">No expenses match.</div>}
    <div className="card list">
      {shown.map(e => {
        const mine = splits.find(s => s.expense_id === e.id && s.member_id === me)?.owed_cents || 0
        const lent = e.amount_cents - mine
        const iPaid = e.paid_by === me
        return (
          <button className="row rowbtn" key={e.id} onClick={() => onOpen(e)}>
            <div className="badge">{CATS[e.category] || '🧾'}</div>
            <div className="grow"><b className="truncate">{e.description}{e.repeat && <span className="faint tiny" title={'Repeats ' + e.repeat}> 🔁</span>}</b>
              <div className="muted tiny">{nameOf(members, e.paid_by)} paid {money(e.amount_cents, cur)}{e.orig_cur ? ` (${money(e.orig_amount, e.orig_cur + ' ')})` : ''}{e.spent_on ? ' · ' + fmtDate(e.spent_on) : ''}</div></div>
            <div className="right">
              {iPaid
                ? <><div className="tiny muted">you lent</div><div className="num pos">{money(lent, cur)}</div></>
                : <><div className="tiny muted">you borrowed</div><div className="num neg">{money(mine, cur)}</div></>}
            </div>
          </button>
        )
      })}
    </div>
    </>
  )
}

/* ---------------- Add / edit expense ---------------- */
function AddExpense({ group, members, user, onClose, edit, editSplits }) {
  const [desc, setDesc] = useState(edit?.description || '')
  const [amount, setAmount] = useState(edit ? (edit.amount_cents / 100).toFixed(2) : '')
  const [paidBy, setPaidBy] = useState(edit?.paid_by || user.id)
  const [cat, setCat] = useState(edit?.category || 'general')
  const [date, setDate] = useState(edit?.spent_on || todayISO())
  const [repeat, setRepeat] = useState(edit?.repeat || 'none')
  const [notes, setNotes] = useState(edit?.notes || '')
  // A group's saved default split (percent / shares / who's in) pre-fills new expenses.
  const def = !edit && group.default_split ? (() => { try { return JSON.parse(group.default_split) } catch { return null } })() : null
  const [type, setType] = useState(edit ? 'exact' : def?.type || 'equal')
  const [mode, setMode] = useState(edit || def ? 'custom' : 'iPaidEqual')
  const [saveDef, setSaveDef] = useState(!!def)
  const [other, setOther] = useState(null)
  // Track who is *left out* (not who is in), so members that load after the sheet opens are included by default.
  const [out, setOut] = useState(() => edit && editSplits?.length ? members.map(m => m.user_id).filter(id => !editSplits.some(s => s.member_id === id)) : def?.out || [])
  // Raw text per person for the active mode: cents-as-text for exact, else a number (percent / shares).
  const [items, setItems] = useState([]) // itemized: [{ key, name, price, people }]
  // Paid in another currency: { cur, to, amount, rate, loading, err, keep }. 'to' is the group's ISO code, remembered per group.
  const groupCode = () => localStorage.getItem('splitit.code.' + group.id) || guessCode(group.currency)
  const [fx, setFx] = useState(() => edit?.orig_cur && edit.orig_amount
    ? { cur: edit.orig_cur, to: groupCode(), amount: (edit.orig_amount / 100).toFixed(2), rate: String(+(edit.amount_cents / edit.orig_amount).toFixed(6)), keep: true }
    : null)
  useEffect(() => { // fetch today's rate when the currencies change (not for a saved expense being edited)
    if (!fx) return
    if (fx.keep) { setFx(f => ({ ...f, keep: false })); return }
    localStorage.setItem('splitit.code.' + group.id, fx.to)
    let live = true
    setFx(f => ({ ...f, loading: true, err: '' }))
    db.fetchRate(fx.cur, fx.to)
      .then(r => live && setFx(f => ({ ...f, rate: String(r), loading: false })))
      .catch(() => live && setFx(f => ({ ...f, loading: false, err: 'Couldn’t get today’s rate — type it in' })))
    return () => { live = false }
  }, [fx?.cur, fx?.to])
  useEffect(() => { // keep the total in the group's currency in step
    if (!fx) return
    const c = toCents(fx.amount), r = parseFloat(fx.rate)
    if (c > 0 && r > 0) setAmount((convertCents(c, r) / 100).toFixed(2))
  }, [fx?.amount, fx?.rate])
  const openFx = () => { const to = groupCode(); setFx({ cur: to === 'EUR' ? 'USD' : 'EUR', to, amount: '', rate: '' }) }
  const [scanned, setScanned] = useState([]) // items read from a receipt photo
  const [txt, setTxt] = useState(() => def?.txt || Object.fromEntries((edit && editSplits || []).map(s => [s.member_id, (s.owed_cents / 100).toFixed(2)])))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [scan, setScan] = useState(0) // 0 idle, 1..100 progress
  const [preview, setPreview] = useState(null)
  const fileRef = useRef(null)
  const cur = group.currency
  const amt = toCents(amount)
  const myName = displayName(user)

  async function onReceipt(e) {
    const f = e.target.files?.[0]; if (!f) return
    setErr(''); setPreview(URL.createObjectURL(f)); setScan(1)
    try {
      const Tesseract = (await import('tesseract.js')).default
      const { data } = await Tesseract.recognize(f, 'eng', {
        logger: m => { if (m.status === 'recognizing text') setScan(Math.max(1, Math.round(m.progress * 100))) },
      })
      const parsed = parseReceipt(data.text)
      if (parsed.amount) setAmount((parsed.amount / 100).toFixed(2))
      if (parsed.merchant) setDesc(d => d || parsed.merchant)
      if (!parsed.amount) setErr('Couldn’t read a total — type it in')
      setScanned(parseReceiptItems(data.text))
    } catch { setErr('Couldn’t scan that image — enter it manually') }
    finally { setScan(0) }
  }

  // Quick choices (Splitwise-style). 'custom' reveals the detailed split controls.
  const others = members.filter(m => m.user_id !== user.id)
  const who = (other && others.some(m => m.user_id === other)) ? other : others[0]?.user_id
  const allIds = members.map(m => m.user_id)
  const quick = mode !== 'custom' && others.length > 0
  const eff = !quick ? { P: paidBy, T: type, X: out } : {
    iPaidEqual: { P: user.id, T: 'equal', X: [] },
    theyPaidEqual: { P: who, T: 'equal', X: [] },
    theyOweFull: { P: user.id, T: 'equal', X: allIds.filter(id => id !== who) },
    iOweFull: { P: who, T: 'equal', X: allIds.filter(id => id !== user.id) },
  }[mode]
  const itemRes = eff.T === 'items' ? itemSplit(amt, items.map(i => ({ cents: toCents(i.price), people: i.people })), eff.P) : null
  const picks = itemRes ? Object.keys(itemRes.owed) : members.map(m => m.user_id).filter(id => !eff.X.includes(id))
  const toggle = id => setOut(o => o.includes(id) ? o.filter(x => x !== id) : [...o, id])
  const vals = Object.fromEntries(picks.map(id => [id, eff.T === 'exact' ? toCents(txt[id]) : (parseFloat(txt[id]) || 0)]))
  const owed = itemRes ? itemRes.owed : picks.length ? splitsFromDraft({ amount: amt, type: eff.T, picks, vals, payer: eff.P }) : {}
  const newItem = (name = '', price = '') => ({ key: Math.random().toString(36).slice(2), name, price, people: allIds })
  const setItem = (key, patch) => setItems(list => list.map(i => i.key === key ? { ...i, ...patch } : i))
  function useScanned() {
    setMode('custom'); setType('items')
    setItems(scanned.map(x => newItem(x.name, (x.cents / 100).toFixed(2))))
  }
  const nice = n => String(+n.toFixed(2))

  // Switching mode starts from an even split the person can then adjust.
  function pickType(t) {
    setType(t)
    const even = n => allocate(n, picks.map(id => ({ id, w: 1 })), paidBy)
    if (t === 'exact') setTxt(Object.fromEntries(Object.entries(even(amt)).map(([id, c]) => [id, (c / 100).toFixed(2)])))
    if (t === 'percent') setTxt(Object.fromEntries(Object.entries(even(10000)).map(([id, c]) => [id, nice(c / 100)])))
    if (t === 'shares') setTxt(Object.fromEntries(picks.map(id => [id, '1'])))
    if (t === 'items' && !items.length) setItems([newItem()])
  }

  let remain
  const sum = picks.reduce((s, id) => s + vals[id], 0)
  if (itemRes) {
    const priced = items.filter(i => toCents(i.price) > 0), extra = amt - itemRes.itemsTotal
    remain = !priced.length ? { ok: false, text: 'Add the items and their prices' }
      : priced.some(i => !i.people.length) ? { ok: false, text: 'Tap who had each item' }
      : extra < 0 ? { ok: false, text: `Items come to ${money(itemRes.itemsTotal, cur)}, more than the total` }
      : { ok: true, text: `Items ${money(itemRes.itemsTotal, cur)}${extra ? ` + ${money(extra, cur)} tax/tip shared` : ''}` }
  } else if (!picks.length) remain = { ok: false, text: 'Tap at least one person to split with' }
  else if (eff.T === 'equal') remain = { ok: true, text: `${money(Math.round(amt / picks.length), cur)} each · ${picks.length} ${picks.length === 1 ? 'person' : 'people'}` }
  else if (eff.T === 'exact') {
    const diff = amt - sum
    remain = { ok: diff === 0 && amt > 0, text: amt === 0 ? 'Enter the total first' : diff === 0 ? `Adds up to ${money(amt, cur)}` : diff > 0 ? `${money(diff, cur)} left to assign` : `${money(-diff, cur)} too much` }
  } else if (eff.T === 'percent') {
    const diff = 100 - sum
    remain = { ok: Math.abs(diff) < 0.001, text: Math.abs(diff) < 0.001 ? 'Adds up to 100%' : diff > 0 ? `${nice(diff)}% left to assign` : `${nice(-diff)}% too much` }
  } else remain = { ok: sum > 0, text: sum > 0 ? `${nice(sum)} ${sum === 1 ? 'share' : 'shares'} · ${money(Math.round(amt / sum), cur)} per share` : 'Give someone at least one share' }
  const status = remain.ok ? 'ok' : amt === 0 && eff.T !== 'equal' ? '' : 'bad'

  async function save() {
    setErr('')
    if (!desc.trim()) return setErr('Add a description')
    if (amt <= 0) return setErr('Enter an amount')
    if (!picks.length) return setErr('Pick who shares this')
    // Appwrite membership privacy can blank other members' IDs; saving would merge them into one person.
    if (picks.some(id => !id) || !eff.P) return setErr('Can’t see who’s in this group yet. In Appwrite Console → Auth → Security → Memberships privacy, turn on User ID and Name, then reload.')
    if (!remain.ok) return setErr('Split does not add up yet')
    setBusy(true)
    // only send optional fields that are set (or being cleared) so old backends keep working
    const extra = {}
    if (notes.trim() || edit?.notes) extra.notes = notes.trim()
    if (fx && toCents(fx.amount) > 0) { extra.orig_amount = toCents(fx.amount); extra.orig_cur = fx.cur }
    else if (edit?.orig_cur) { extra.orig_amount = null; extra.orig_cur = '' }
    if (repeat !== 'none') {
      extra.repeat = repeat
      if (!edit || edit.repeat !== repeat || !edit.next_on) extra.next_on = nextDate(date, repeat)
    } else if (edit?.repeat) { extra.repeat = ''; extra.next_on = '' }
    const payload = { description: desc.trim(), amount_cents: amt, paid_by: eff.P, category: cat, spent_on: date, owed, extra }
    try {
      if (edit && !navigator.onLine) throw new Error('You’re offline. Editing needs a connection — try again when you’re back online.')
      const queued = !edit && await db.addExpenseOrQueue(group, payload, user.id, myName) === 'queued'
      if (edit) await db.updateExpense(group, edit.id, payload)
      if (queued) return onClose() // saved on this device; uploads when back online
      // remember (or forget) this group's default split; amounts aren't reusable so 'exact' never becomes a default
      const wantDef = !quick && saveDef && type !== 'exact' && type !== 'items'
      if (wantDef) await db.setDefaultSplit(group.id, { type, txt, out }).catch(() => {})
      else if (group.default_split && !quick) await db.setDefaultSplit(group.id, null).catch(() => {})
      logActivity(group, myName, `${edit ? 'edited' : 'added'} “${desc.trim()}” · ${money(amt, cur)}`)
      onClose()
    } catch (e) { setBusy(false); setErr(e.message || 'Could not save') }
  }

  return (
    <Sheet title={edit ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      {!edit && <div className="scanbox">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onReceipt} />
        {preview && <img className="scan-thumb" src={preview} alt="receipt" />}
        <div className="grow">
          <button type="button" className="btn ghost sm" onClick={() => fileRef.current?.click()} disabled={scan > 0}>
            <Ic.camera /> {scan > 0 ? `Reading… ${scan}%` : preview ? 'Rescan receipt' : 'Scan a receipt'}
          </button>
          <div className="tiny faint" style={{ marginTop: 6 }}>Auto-fills the amount and name from a photo.</div>
          {scanned.length > 0 && scan === 0 && <button type="button" className="btn sm" style={{ marginTop: 10 }} onClick={useScanned}>
            Split by item · {scanned.length} found</button>}
          {scan > 0 && <div className="bar" style={{ marginTop: 8 }}><div className="bar-fill" style={{ transform: `scaleX(${scan / 100})` }} /></div>}
        </div>
      </div>}
      <label className="fld"><span>Description</span><input className="inp" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Dinner" autoFocus /></label>
      <label className="fld"><span>Total</span>
        <div className="amt-field"><span className="amt-cur" aria-hidden="true">{cur}</span>
          <input className="inp amt-inp num" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div></label>
      {!fx ? <button type="button" className="linkbtn fxlink" onClick={openFx}>Paid in another currency?</button>
        : <div className="fxbox">
          <div className="fxrow">
            <input className="inp num" inputMode="decimal" value={fx.amount} placeholder="0.00" aria-label={`Amount in ${fx.cur}`} autoFocus
              onChange={e => setFx(f => ({ ...f, amount: e.target.value }))} />
            <select className="inp fxsel" aria-label="Currency you paid in" value={fx.cur} onChange={e => setFx(f => ({ ...f, cur: e.target.value }))}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
          </div>
          <div className="fxrate">
            <span>1 {fx.cur} =</span>
            <input className="num" inputMode="decimal" value={fx.rate} aria-label="Exchange rate" onChange={e => setFx(f => ({ ...f, rate: e.target.value }))} />
            <select className="chipsel sm" aria-label="This group's currency" value={fx.to} onChange={e => setFx(f => ({ ...f, to: e.target.value }))}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
            <span className="faint">{fx.loading ? 'getting today’s rate…' : fx.err || 'today’s rate · you can edit it'}</span>
          </div>
          <button type="button" className="linkbtn" onClick={() => setFx(null)}>Paid in {cur} after all</button>
        </div>}

      <section className="splitbox" aria-label="How to split">
        {others.length > 0 && <>
          <div className="qhead">
            <span>Split</span>
            {others.length > 1 && <label className="qwith">with
              <select className="chipsel" aria-label="Who is this with" value={who} onChange={e => setOther(e.target.value)}>
                {others.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label>}
          </div>
          <div className="qopts" role="radiogroup" aria-label="How to split">
            {quickOptions({ name: nameOf(members, who), n: members.length, amt, cur, group: others.length > 1 }).map(([id, title, sub]) => (
              <button key={id} type="button" role="radio" aria-checked={mode === id} className="qopt" onClick={() => setMode(id)}>
                <span className="radio" aria-hidden="true" />
                <span className="qtext"><b>{title}</b>{sub && <small>{sub}</small>}</span>
              </button>
            ))}
          </div>
        </>}
        {!quick && <>
        {others.length > 0 && <div className="qdivider" />}
        <div className="paidby">
          <span>Paid by</span>
          <select className="chipsel" aria-label="Who paid" value={paidBy} onChange={e => setPaidBy(e.target.value)}>
            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.user_id === user.id ? 'you' : m.display_name}</option>)}</select>
          <span>and split</span>
        </div>
        <div className="seg" role="tablist" aria-label="Split method">
          {SPLIT_MODES.map(([t, label]) =>
            <button key={t} type="button" role="tab" aria-selected={type === t} onClick={() => pickType(t)}>{label}</button>)}
        </div>
        <p className="split-hint">{SPLIT_MODES.find(([t]) => t === type)[2]}</p>

        {type === 'items' ? <div className="items">
          {items.map(it => (
            <div className="item" key={it.key}>
              <div className="item-top">
                <input className="inp item-name" value={it.name} onChange={e => setItem(it.key, { name: e.target.value })} placeholder="Item" aria-label="Item name" />
                <label className="pinput"><span className="aff">{cur}</span>
                  <input inputMode="decimal" className="num" value={it.price} onChange={e => setItem(it.key, { price: e.target.value })} placeholder="0.00" aria-label={`${it.name || 'Item'} price`} /></label>
                <button type="button" className="del" aria-label={`Remove ${it.name || 'item'}`} onClick={() => setItems(l => l.filter(x => x.key !== it.key))}><Ic.close /></button>
              </div>
              <div className="item-people" role="group" aria-label={`Who had ${it.name || 'this item'}`}>
                {members.map(m => {
                  const on = it.people.includes(m.user_id)
                  return <button type="button" key={m.user_id} className="pchip" aria-pressed={on}
                    onClick={() => setItem(it.key, { people: on ? it.people.filter(x => x !== m.user_id) : [...it.people, m.user_id] })}>
                    {m.user_id === user.id ? 'You' : m.display_name}</button>
                })}
              </div>
            </div>
          ))}
          <button type="button" className="btn ghost sm withicon" onClick={() => setItems(l => [...l, newItem()])}><Ic.plus />Add item</button>
          {Object.keys(owed).length > 0 && <div className="item-sum">
            {members.filter(m => owed[m.user_id]).map(m => <span key={m.user_id}>{m.user_id === user.id ? 'You' : m.display_name} <b className="num">{money(owed[m.user_id], cur)}</b></span>)}
          </div>}
        </div>
        : <div className="people">
          {members.map(m => {
            const id = m.user_id, inc = !out.includes(id), name = id === user.id ? 'You' : m.display_name
            return (
              <div className={'prow' + (inc ? '' : ' off')} key={id}>
                <button type="button" className="ptoggle" aria-pressed={inc} onClick={() => toggle(id)}
                  title={inc ? `Leave ${name} out` : `Include ${name}`}>
                  <span className="tick" aria-hidden="true">{inc && <Ic.check />}</span>
                  <Avatar members={members} id={id} />
                  <span className="pname">{name}
                    {inc && (type === 'percent' || type === 'shares') && <small className="num">{money(owed[id] || 0, cur)}</small>}
                    {!inc && <small>not in this expense</small>}
                  </span>
                </button>
                {inc && (type === 'equal'
                  ? <span className="pshare num">{money(owed[id] || 0, cur)}</span>
                  : <label className="pinput">
                    {type === 'exact' && <span className="aff">{cur}</span>}
                    <input inputMode="decimal" className="num" value={txt[id] ?? ''} onChange={e => setTxt(s => ({ ...s, [id]: e.target.value }))}
                      aria-label={`${name}: ${type === 'exact' ? 'amount' : type}`} placeholder={type === 'exact' ? '0.00' : type === 'percent' ? '0' : '1'} />
                    {type === 'percent' && <span className="aff">%</span>}
                    {type === 'shares' && <span className="aff">sh</span>}
                  </label>)}
              </div>
            )
          })}
        </div>}
        <div className={'remain ' + status} role="status">{remain.ok && <Ic.check />}<span>{remain.text}</span></div>
        {type !== 'exact' && type !== 'items' && <label className="defchk"><input type="checkbox" checked={saveDef} onChange={e => setSaveDef(e.target.checked)} />
          <span>Use this split by default in {group.name}</span></label>}
        </>}
      </section>

      <div className="two">
        <label className="fld"><span>Category</span>
          <select className="inp" value={cat} onChange={e => setCat(e.target.value)}>
            {Object.keys(CATS).map(c => <option key={c} value={c}>{CATS[c]} {c}</option>)}</select></label>
        <label className="fld"><span>Date</span>
          <input className="inp" type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)} /></label>
      </div>
      <details className="more" open={!!(edit?.repeat || edit?.notes) || undefined}>
        <summary>More options{repeat !== 'none' ? ` · repeats ${repeat}` : ''}{notes.trim() ? ' · note' : ''}</summary>
        <label className="fld"><span>Repeats</span>
          <select className="inp" value={repeat} onChange={e => setRepeat(e.target.value)}>
            <option value="none">Never</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></label>
        {repeat !== 'none' && <p className="split-hint" style={{ marginTop: -8 }}>Next one on {fmtDate(nextDate(date, repeat))}, added automatically.</p>}
        <label className="fld"><span>Notes</span>
          <textarea className="inp" rows={2} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything to remember…" /></label>
      </details>
      {err && <div className="err"><Ic.alert />{err}</div>}
      <button className="btn block" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit ? 'Save changes' : 'Save expense'}</button>
    </Sheet>
  )
}

/* ---------------- Settle up ---------------- */
function SettleUp({ group, members, user, pre, onClose }) {
  const [from, setFrom] = useState(pre?.from || members[0]?.user_id)
  const [to, setTo] = useState(pre?.to || members[1]?.user_id || members[0]?.user_id)
  const [amount, setAmount] = useState(pre ? (pre.amount / 100).toFixed(2) : '')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState('')
  const cur = group.currency
  const a = toCents(amount)
  const toM = members.find(m => m.user_id === to), fromM = members.find(m => m.user_id === from), fromName = nameOf(members, from), toName = nameOf(members, to)
  const copy = async (k, v) => { try { await navigator.clipboard.writeText(v); setCopied(k); setTimeout(() => setCopied(''), 1500) } catch { /* ignore */ } }
  const ask = () => db.shareText('SplitIt', `Hi ${fromName}, you owe me ${money(a, cur)} for “${group.name}” on SplitIt. You can send it by Interac e-Transfer to ${user.email}. Thanks!`).catch(() => {})
  const [bank, setBank] = useState(myBank)
  const memo = `SplitIt · ${group.name}`
  // Copy the recipient's email (the fiddly part to type), then open the bank. The amount stays big on screen.
  async function payWithBank(b) {
    if (toM?.email) await copy('email', toM.email)
    window.open(b[2], '_blank', 'noopener')
  }
  const chooseBank = id => { const b = BANKS.find(x => x[0] === id); if (!b) return; localStorage.setItem('splitit.bank', id); setBank(b) }

  async function record() {
    if (a <= 0) return setErr('Enter an amount')
    if (from === to) return setErr('Pick two different people')
    try {
      await db.addSettlement(group, { from_member: from, to_member: to, amount_cents: a })
      logActivity(group, displayName(user), `${nameOf(members, from)} paid ${nameOf(members, to)} ${money(a, cur)}${note.trim() ? ` — “${note.trim().slice(0, 200)}”` : ''}`)
      onClose()
    } catch (e) { setErr(e.message || 'Could not record') }
  }
  return (
    <Sheet title="Record a payment" onClose={onClose}>
      <div className="two">
        <label className="fld"><span>From</span>
          <select className="inp" value={from} onChange={e => setFrom(e.target.value)}>
            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label>
        <label className="fld"><span>To</span>
          <select className="inp" value={to} onChange={e => setTo(e.target.value)}>
            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label>
      </div>
      <label className="fld"><span>Amount ({cur})</span><input className="inp" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
      {from === user.id && to !== user.id && a > 0 && <div className="payhelp">
        <div className="payhelp-t">Pay {toName} by Interac e-Transfer</div>
        <div className="payamt num">{money(a, cur)}</div>
        {toM?.email
          ? <div className="payrow"><span className="muted">Send to</span><b className="truncate">{toM.email}</b>
            <button type="button" className="btn ghost sm" onClick={() => copy('email', toM.email)}>{copied === 'email' ? 'Copied ✓' : 'Copy'}</button></div>
          : <p className="split-hint">{toName} has no email on SplitIt — ask them which email to send to.</p>}
        <div className="payrow"><span className="muted">Message</span><span className="truncate">{memo}</span>
          <button type="button" className="btn ghost sm" onClick={() => copy('memo', memo)}>{copied === 'memo' ? 'Copied ✓' : 'Copy'}</button></div>
        {bank
          ? <button type="button" className="btn block withicon paybtn" onClick={() => payWithBank(bank)}><Ic.bank />{toM?.email ? 'Copy email & open ' : 'Open '}{bank[1]}</button>
          : <label className="fld paypick"><span>Your bank (remembered on this phone)</span>
            <select className="inp" defaultValue="" onChange={e => chooseBank(e.target.value)}>
              <option value="" disabled>Choose your bank…</option>
              {BANKS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
        <p className="split-hint" style={{ margin: '10px 0 0' }}>
          In your bank: <b>Send money → Interac e-Transfer</b>, paste the email, enter <b>{money(a, cur)}</b>. If {toName} has Autodeposit on, there’s no security question and it arrives right away. Then come back and tap <b>Record payment</b>.
          {bank && <> <button type="button" className="linkbtn" onClick={() => { localStorage.removeItem('splitit.bank'); setBank(null) }}>Change bank</button></>}</p>
      </div>}
      {to === user.id && from !== user.id && a > 0 && <div className="payhelp">
        <div className="payhelp-t">Get paid by {fromName}</div>
        <button type="button" className="btn ghost block withicon" onClick={ask}><Ic.share />Ask {fromName} to pay {money(a, cur)}</button>
        <p className="split-hint" style={{ margin: '10px 0 0' }}>
          Fastest: in <b>your</b> bank app use <b>Interac → Request money</b>{fromM?.email ? <> to <b>{fromM.email}</b></> : ''} for <b>{money(a, cur)}</b>. {fromName} gets a link that opens their bank with the amount already filled in.</p>
      </div>}
      <label className="fld"><span>Note (optional)</span><input className="inp" maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder="e-Transfer, cash…" /></label>
      {err && <div className="err"><Ic.alert />{err}</div>}
      <button className="btn block" onClick={record}>Record payment</button>
    </Sheet>
  )
}

/* ---------------- Realtime chat ---------------- */
function Chat({ group, user, members }) {
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const endRef = useRef(null)
  const myName = displayName(user)

  useEffect(() => {
    db.listMessages(group.id).then(setMsgs).catch(() => {})
    const unsub = db.subscribeMessages(group.id, m => setMsgs(cur => cur.some(x => x.id === m.id) ? cur : [...cur, m]))
    return () => unsub()
  }, [group.id])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  async function send(e) {
    e.preventDefault(); const body = text.trim(); if (!body) return; setText('')
    try { await db.sendMessage(group, user.id, myName, body) } catch { /* ignore */ }
  }
  return (
    <div className="chat">
      <div className="msgs">
        {msgs.length === 0 && <div className="muted center">No messages yet. Say hi 👋</div>}
        {msgs.map(m => (
          <div key={m.id} className={'msg ' + (m.user_id === user.id ? 'mine' : '')}>
            {m.user_id !== user.id && <Avatar members={members} id={m.user_id} />}
            <div className="bubble">
              {m.user_id !== user.id && <div className="who" style={{ color: colorOf(members, m.user_id) }}>{m.display_name}</div>}
              {m.body}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={send}>
        <input className="inp" value={text} onChange={e => setText(e.target.value)} placeholder="Message…" />
        <button className="btn" aria-label="Send"><Ic.send /></button>
      </form>
    </div>
  )
}

/* ---------------- Activity + insights + CSV ---------------- */
function timeAgo(ts) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000
  if (d < 60) return 'just now'
  if (d < 3600) return Math.floor(d / 60) + 'm ago'
  if (d < 86400) return Math.floor(d / 3600) + 'h ago'
  return Math.floor(d / 86400) + 'd ago'
}
// Reusable chart block. Pass `members` to also show the "Who paid" bar.
function Charts({ expenses, cur, members, stats = true }) {
  const byCat = {}
  expenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount_cents })
  const catData = Object.entries(byCat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  const total = catData.reduce((s, c) => s + c.value, 0)
  const count = expenses.length
  const avg = count ? Math.round(total / count) : 0
  const topCat = catData[0]
  const byDay = {}
  expenses.forEach(e => { if (e.spent_on) byDay[e.spent_on] = (byDay[e.spent_on] || 0) + e.amount_cents })
  const timeData = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ date: fmtDate(d), value: v }))
  const showPayers = members && members.length > 0
  const byPayer = {}
  if (showPayers) expenses.forEach(e => { byPayer[e.paid_by] = (byPayer[e.paid_by] || 0) + e.amount_cents })
  const payerData = Object.entries(byPayer).map(([id, value]) => ({ name: nameOf(members, id), value })).sort((a, b) => b.value - a.value)

  const css = getComputedStyle(document.documentElement)
  const axis = css.getPropertyValue('--muted').trim() || '#888'
  const accent = css.getPropertyValue('--accent').trim() || '#1f6b52'
  const tip = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--fg)', fontSize: 13 }

  function exportCsv() {
    const esc = v => '"' + String(v).replace(/"/g, '""') + '"'
    const lines = ['Date,Description,Category,Amount']
    expenses.forEach(e => lines.push([e.spent_on || '', esc(e.description || ''), e.category, (e.amount_cents / 100).toFixed(2)].join(',')))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
    a.download = 'expenses.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  if (total === 0) return <div className="empty">Add an expense to see spending charts.</div>
  return (
    <>
      {stats && <div className="stats">
        <div className="stat"><div className="stat-num num">{money(total, cur)}</div><div className="stat-lbl">total spent</div></div>
        <div className="stat"><div className="stat-num num">{count}</div><div className="stat-lbl">expenses</div></div>
        <div className="stat"><div className="stat-num num">{money(avg, cur)}</div><div className="stat-lbl">avg / expense</div></div>
        <div className="stat"><div className="stat-num">{CATS[topCat?.name] || '🧾'} {topCat?.name || '—'}</div><div className="stat-lbl">top category</div></div>
      </div>}

      {timeData.length >= 2 && <>
        <div className="eyebrow mt">Spending over time</div>
        <div className="card pad">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={timeData} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
              <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.35} /><stop offset="100%" stopColor={accent} stopOpacity={0} />
              </linearGradient></defs>
              <CartesianGrid vertical={false} stroke={axis} strokeOpacity={0.15} />
              <XAxis dataKey="date" tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={v => money(v, cur)} contentStyle={tip} />
              <Area type="monotone" dataKey="value" stroke={accent} strokeWidth={2} fill="url(#g)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </>}

      <div className="eyebrow between mt">Spending by category
        <button className="linklike" onClick={exportCsv}><Ic.download /> Export CSV</button></div>
      <div className="card pad">
        <div className="donut-wrap">
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={catData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="none">
                {catData.map((d, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => money(v, cur)} contentStyle={tip} />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-center"><div className="tiny muted">Total spent</div><div className="num donut-total">{money(total, cur)}</div></div>
        </div>
        <div className="legend">
          {catData.map((d, i) => (
            <div className="leg" key={d.name}>
              <span className="dot" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="grow">{CATS[d.name] || '🧾'} {d.name}</span>
              <span className="num">{money(d.value, cur)}</span>
            </div>
          ))}
        </div>
      </div>

      {showPayers && <>
        <div className="eyebrow mt">Who paid</div>
        <div className="card pad">
          <ResponsiveContainer width="100%" height={Math.max(110, payerData.length * 48)}>
            <BarChart data={payerData} layout="vertical" margin={{ left: 0, right: 18, top: 2, bottom: 2 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={84} tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={v => money(v, cur)} cursor={{ fill: 'transparent' }} contentStyle={tip} />
              <Bar dataKey="value" fill={accent} radius={[0, 8, 8, 0]} barSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>}
    </>
  )
}

const monthName = (ym, year) => new Date(ym + '-01T00:00').toLocaleDateString(undefined, year ? { month: 'long', year: 'numeric' } : { month: 'long' })

// Home: your share of spending for one month, with ‹ › to move between months.
function MonthSpending({ items, groups, cur, month, setMonth, otherCurrencies }) {
  const now = monthOf(todayISO())
  const first = items.reduce((m, i) => (monthOf(i.spent_on) < m ? monthOf(i.spent_on) : m), now)
  const these = inMonth(items, month), total = sumCents(these)
  const prevYm = shiftMonth(month, -1), prev = sumCents(inMonth(items, prevYm))
  const delta = prev > 0 && total > 0 ? Math.round((total - prev) / prev * 100) : null
  const byGroup = Object.entries(these.reduce((a, i) => { a[i.group_id] = (a[i.group_id] || 0) + i.amount_cents; return a }, {}))
    .map(([id, v]) => ({ name: groups.find(g => g.id === id)?.name || 'Group', v })).sort((a, b) => b.v - a.v)
  return (
    <section className="spend" id="spending" aria-label="Your spending">
      <div className="spend-head">
        <button className="icon-btn" aria-label="Previous month" disabled={month <= first} onClick={() => setMonth(shiftMonth(month, -1))}><Ic.back /></button>
        <div className="spend-month">{monthName(month, true)}</div>
        <button className="icon-btn" aria-label="Next month" disabled={month >= now} onClick={() => setMonth(shiftMonth(month, 1))}><Ic.chev /></button>
      </div>
      <div className="spend-label">{month === now ? 'You’ve spent this month' : 'You spent'}</div>
      <div className="spend-total num">{money(total, cur)}</div>
      <p className="spend-sub">
        {total === 0 ? 'Nothing in this month.' : `Your share of ${these.length} expense${these.length === 1 ? '' : 's'} · settle-ups don’t count`}
        {delta !== null && <span className={delta > 0 ? 'neg' : 'pos'}> · {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}% vs {monthName(prevYm)}</span>}
      </p>
      {otherCurrencies && <p className="tiny faint">Showing {cur} groups only.</p>}
      {these.length > 0 && <Charts expenses={these} cur={cur} stats={false} />}
      {byGroup.length > 1 && <>
        <div className="eyebrow mt">By group</div>
        <div className="card list">
          {byGroup.map(g => (
            <div className="row" key={g.name}>
              <div className="grow"><b className="truncate">{g.name}</b>
                <div className="gbar"><span style={{ transform: `scaleX(${g.v / byGroup[0].v})` }} /></div></div>
              <div className="num">{money(g.v, cur)}</div>
            </div>
          ))}
        </div>
      </>}
    </section>
  )
}

// First week of a month (or when opened from the recap notification): last month in one card.
function RecapCard({ items, groups, cur, overall, onSee }) {
  const forced = sessionStorage.getItem('splitit.recap')
  const ym = forced || shiftMonth(monthOf(todayISO()), -1)
  const [hidden, setHidden] = useState(() => !!localStorage.getItem('splitit.recapSeen.' + ym))
  const these = inMonth(items, ym)
  if (hidden || !these.length || (!forced && new Date().getDate() > 7)) return null
  const total = sumCents(these), nGroups = new Set(these.map(i => i.group_id)).size
  const top = these.reduce((a, b) => (b.amount_cents > a.amount_cents ? b : a))
  const topGroup = groups.length > 1 && groups.find(g => g.id === top.group_id)?.name
  const dismiss = () => { localStorage.setItem('splitit.recapSeen.' + ym, '1'); sessionStorage.removeItem('splitit.recap'); setHidden(true) }
  return (
    <div className="recap" role="region" aria-label={`${monthName(ym)} recap`}>
      <div className="recap-t">🗓️ {monthName(ym)} recap</div>
      <p>You spent <b className="num">{money(total, cur)}</b> across {nGroups} group{nGroups === 1 ? '' : 's'}. Biggest: <b>{top.description}</b> <span className="num">{money(top.amount_cents, cur)}</span>{topGroup ? ` in ${topGroup}` : ''}.</p>
      {overall !== 0 && <p>{overall > 0 ? 'You’re still owed' : 'You still owe'} <b className="num">{money(Math.abs(overall), cur)}</b> overall.</p>}
      <div className="recap-actions">
        <button className="btn sm" onClick={() => onSee(ym)}>See {monthName(ym)}</button>
        <button className="linkbtn" onClick={dismiss}>Dismiss</button>
      </div>
    </div>
  )
}

// Everyone is at $0: celebrate, show the last payment, offer to archive (personal) the group.
function SettledBanner({ settlements, members, cur, archived, onToggle }) {
  const last = settlements[0] // newest first
  return (
    <div className="settled" role="status">
      <div className="settled-t">All settled 🎉</div>
      <p>{last ? <>Last payment: <b>{nameOf(members, last.from_member)}</b> paid <b>{nameOf(members, last.to_member)}</b> <span className="num">{money(last.amount_cents, cur)}</span> on {fmtDate(String(last.created_at).slice(0, 10))}.</> : 'Everyone is even.'}</p>
      <div className="settled-actions">
        <button className="btn sm" onClick={onToggle}>{archived ? 'Unarchive' : 'Archive group'}</button>
        <span className="tiny muted">{archived ? 'Archived on your Home. ' : ''}Only your Home is tidied; it comes back if anything new is owed.</span>
      </div>
    </div>
  )
}

function GroupActivityTab({ activity, expenses, settlements = [], cur, members }) {
  return (
    <>
      <Charts expenses={expenses} cur={cur} members={members} />
      {settlements.length > 0 && <>
        <div className="eyebrow mt">Payments</div>
        <div className="card list" aria-label="Settle-up history">
          {settlements.map(s => (
            <div className="row" key={s.id}>
              <Avatar members={members} id={s.from_member} />
              <div className="grow"><b>{nameOf(members, s.from_member)}</b> <span className="muted">paid</span> <b>{nameOf(members, s.to_member)}</b>
                <div className="tiny faint">{fmtDate(String(s.created_at).slice(0, 10))}</div></div>
              <div className="num pos">{money(s.amount_cents, cur)}</div>
            </div>
          ))}
        </div>
      </>}
      <div className="eyebrow mt">Recent activity</div>
      {activity.length === 0
        ? <div className="empty">Activity appears here as people add expenses and settle up.</div>
        : <div className="card list">
          {activity.map(a => (
            <div className="row" key={a.id}>
              <div className="grow"><b>{a.actor_name}</b> <span className="muted">{a.text}</span></div>
              <div className="tiny faint" style={{ flex: 'none' }}>{timeAgo(a.created_at)}</div>
            </div>
          ))}
        </div>}
    </>
  )
}

/* ---------------- Expense detail + comments ---------------- */
function ExpenseDetail({ group, members, user, expense, splits, onClose, onEdit, onDeleted }) {
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const myName = displayName(user)
  const cur = group.currency

  useEffect(() => {
    db.listComments(expense.id).then(setComments).catch(() => {})
    const unsub = db.subscribeComments(expense.id, c => setComments(cur => cur.some(x => x.id === c.id) ? cur : [...cur, c]))
    return () => unsub()
  }, [expense.id])

  async function send(e) {
    e.preventDefault(); const body = text.trim(); if (!body) return; setText('')
    try { await db.addComment(group, expense.id, user.id, myName, body) } catch { /* ignore */ }
  }
  async function del() {
    try { await db.deleteExpense(expense.id); logActivity(group, myName, `deleted “${expense.description}”`); onDeleted?.(expense, splits); onClose() } catch { /* ignore */ }
  }

  return (
    <Sheet title={expense.description} onClose={onClose}>
      <div className="detail-head">
        <div className="badge big">{CATS[expense.category] || '🧾'}</div>
        <div>
          <div className="detail-amt num">{money(expense.amount_cents, cur)}</div>
          <div className="muted tiny">{nameOf(members, expense.paid_by)} paid{expense.spent_on ? ' · ' + fmtDate(expense.spent_on) : ''}</div>
          {expense.orig_cur && <div className="tiny faint">Paid {money(expense.orig_amount, expense.orig_cur + ' ')} · 1 {expense.orig_cur} ≈ {+(expense.amount_cents / expense.orig_amount).toFixed(4)}</div>}
          {expense.repeat && <div className="tiny faint">🔁 Repeats {expense.repeat}{expense.next_on ? ` · next ${fmtDate(expense.next_on)}` : ''}</div>}
        </div>
      </div>
      {expense.notes && <div className="note mt" style={{ whiteSpace: 'pre-wrap' }}>{expense.notes}</div>}
      <div className="eyebrow mt">Split</div>
      <div className="card list">
        {splits.map(s => (
          <div className="row" key={s.member_id}>
            <Avatar members={members} id={s.member_id} />
            <div className="grow">{nameOf(members, s.member_id)}</div>
            <div className="num">{money(s.owed_cents, cur)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, margin: '14px 0' }}>
        <button className="btn ghost" style={{ flex: 1 }} onClick={onEdit}><Ic.edit /> Edit</button>
        {confirmDel
          ? <button className="btn danger" style={{ flex: 1 }} onClick={del}>Confirm delete</button>
          : <button className="btn ghost danger-text" style={{ flex: 1 }} onClick={() => setConfirmDel(true)}><Ic.trash /> Delete</button>}
      </div>
      <div className="eyebrow">Comments</div>
      <div className="comments">
        {comments.length === 0 && <div className="muted tiny">No comments yet.</div>}
        {comments.map(c => <div className="cmt" key={c.id}><b style={{ color: colorOf(members, c.user_id) }}>{c.display_name}</b> {c.body}</div>)}
      </div>
      <form className="composer flat" onSubmit={send}>
        <input className="inp" value={text} onChange={e => setText(e.target.value)} placeholder="Add a comment…" />
        <button className="btn" aria-label="Send"><Ic.send /></button>
      </form>
    </Sheet>
  )
}

/* re-exported so forms can log without importing db everywhere */
function logActivity(group, name, text) { db.logActivity(group, name, text) }

/* ---------------- Sheet (modal) ---------------- */
function Sheet({ title, onClose, children }) {
  const bgRef = useRef(null)
  // iOS Safari doesn't shrink fixed elements when the keyboard opens; it only shrinks the
  // visual viewport. Pin the backdrop to the visible area so the sheet sits above the keyboard.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const fit = () => { const el = bgRef.current; if (el) { el.style.top = vv.offsetTop + 'px'; el.style.height = vv.height + 'px' } }
    fit()
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit)
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit) }
  }, [])
  // keep the field being typed in visible once the keyboard has finished animating
  const onFocus = e => { if (e.target.matches('input,select,textarea')) setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300) }
  return (
    <div className="sheet-bg" ref={bgRef} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sheet" onFocus={onFocus}>
        <div className="sheet-head"><h2>{title}</h2><button className="icon-btn" aria-label="Close" onClick={onClose}><Ic.close /></button></div>
        {children}
      </div>
    </div>
  )
}
