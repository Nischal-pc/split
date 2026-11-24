import React, { useEffect, useRef, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, AreaChart, Area, CartesianGrid } from 'recharts'
import * as db from './db.js'
import { computeNets, simplify, splitsFromDraft, toCents, money, parseReceipt } from './split.js'

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
  useEffect(() => { boot() }, [])
  const onAuthed = async () => { await db.acceptInviteFromUrl().catch(() => {}); setUser(await db.getUser()) }

  const signOut = async () => { await db.signOut(); setGroupId(null); setUser(null) }

  if (user === undefined) return <div className="center">Loading…</div>
  if (recovery) return <ResetPassword rec={recovery} onDone={() => setRecovery(null)} />
  if (!user) return <Auth onAuthed={onAuthed} />
  if (groupId) return <><Header /><GroupView groupId={groupId} user={user} onBack={() => setGroupId(null)} /></>
  return <Shell user={user} onOpen={setGroupId} onSignOut={signOut} />
}

function Header() {
  const toggleTheme = () => {
    const cur = document.documentElement.getAttribute('data-theme')
    const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches
    document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark')
  }
  return (
    <header>
      <div className="bar">
        <h1><span className="logo">S</span>SplitIt</h1>
        <button className="icon-btn" title="Toggle theme" aria-label="Toggle theme" onClick={toggleTheme}><Ic.moon /></button>
      </div>
    </header>
  )
}

/* ---------------- Shell with bottom-tab navigation ---------------- */
function Shell({ user, onOpen, onSignOut }) {
  const [tab, setTab] = useState('home')
  return (
    <>
      <Header />
      {tab === 'home' && <HomeTab user={user} onOpen={onOpen} />}
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
          {mode !== 'forgot' && (
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
function HomeTab({ user, onOpen }) {
  const [groups, setGroups] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [sheet, setSheet] = useState(null) // 'new' | 'join'

  async function load() {
    try { setGroups(await db.listGroups(user.id)) } catch { setGroups([]) }
    try { setExpenses(await db.listAllExpenses()) } catch { setExpenses([]) }
  }
  useEffect(() => { load() }, [])

  const first = displayName(user).split(/[\s@]/)[0]
  const overall = (groups || []).reduce((s, g) => s + g.myNet, 0)
  const currencies = [...new Set((groups || []).map(g => g.currency))]
  const oneCur = currencies.length === 1 ? currencies[0] : null

  return (
    <main className="wrap">
      <div className="home-hero">
        <div className="greet">Hi {first}</div>
        {groups && groups.length > 0 && oneCur
          ? <>
            <div className={'bignum num ' + (overall > 0 ? 'pos' : overall < 0 ? 'neg' : '')}>
              {overall === 0 ? 'All settled' : money(Math.abs(overall), oneCur)}</div>
            <div className="sublabel muted">
              {overall === 0 ? 'nothing outstanding across your groups' : overall > 0 ? 'owed to you across all groups' : 'you owe across all groups'}</div>
          </>
          : <div className="bignum">Welcome 👋</div>}
      </div>

      <div className="home-actions">
        <button className="btn" onClick={() => setSheet('new')}>+ New group</button>
        <button className="btn ghost" onClick={() => setSheet('join')}>Join by code</button>
      </div>

      {oneCur && expenses.length > 0 && <>
        <div className="eyebrow mt">Your spending</div>
        <Charts expenses={expenses} cur={oneCur} />
      </>}

      <div className="eyebrow mt">Your groups</div>
      {groups === null ? <div className="muted pad">Loading…</div>
        : groups.length === 0 ? <div className="empty"><div className="big">🧾</div>No groups yet.<br />Create one and invite your friends.</div>
          : <div className="card list">
            {groups.map(g => (
              <button key={g.id} className="row rowbtn" onClick={() => onOpen(g.id)}>
                <div className="badge">👥</div>
                <div className="grow"><b>{g.name}</b>
                  <div className={'tiny ' + (g.myNet > 0 ? 'pos' : g.myNet < 0 ? 'neg' : 'muted')}>
                    {g.myNet === 0 ? 'settled up' : g.myNet > 0 ? `you are owed ${money(g.myNet, g.currency)}` : `you owe ${money(-g.myNet, g.currency)}`}</div>
                </div>
                <div className="chev"><Ic.chev /></div>
              </button>
            ))}
          </div>}

      {sheet === 'new' && <NewGroup user={user} onClose={() => setSheet(null)} onDone={id => { setSheet(null); onOpen(id) }} />}
      {sheet === 'join' && <JoinGroup user={user} onClose={() => setSheet(null)} onDone={id => { setSheet(null); onOpen(id) }} />}
    </main>
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

  async function load() {
    const g = await db.getGroup(groupId)
    setGroup(g)
    const [mem, d] = await Promise.all([db.listMembers(g.team_id), db.loadGroupData(groupId)])
    setMembers(mem); setData(d)
  }
  useEffect(() => {
    let unsub = () => {}
    ;(async () => {
      const g = await db.getGroup(groupId)
      g.join_code = g.join_code || await db.ensureJoinCode(g)
      setGroup(g)
      const [mem, d] = await Promise.all([db.listMembers(g.team_id), db.loadGroupData(groupId)])
      setMembers(mem); setData(d)
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
          <button className="btn ghost sm" onClick={() => setSheet('people')}>+ Add people</button>
          <button className="btn ghost sm" onClick={() => setSheet('people')}>Settings</button>
        </div>
      </div>

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
      {tab === 'activity' && <GroupActivityTab activity={activity} expenses={expenses} cur={cur} members={members} />}
      {tab === 'chat' && <Chat group={group} user={user} members={members} />}

      {tab === 'expenses' && (
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setSheet({ settle: null })}>Settle up</button>
          <button className="btn" onClick={() => setSheet('add')}>+ Add expense</button>
        </div>
      )}

      {sheet === 'add' && <AddExpense group={group} members={members} user={user} onClose={() => setSheet(null)} />}
      {sheet === 'people' && <ManagePeople group={group} members={members} user={user} onClose={() => setSheet(null)} onLeave={onBack} />}
      {sheet && sheet.settle !== undefined && <SettleUp group={group} members={members} user={user} pre={sheet.settle} onClose={() => setSheet(null)} />}
      {sheet && sheet.detail && <ExpenseDetail group={group} members={members} user={user} expense={sheet.detail}
        splits={splits.filter(s => s.expense_id === sheet.detail.id)} onClose={() => setSheet(null)} onEdit={() => setSheet({ edit: sheet.detail })} />}
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

function ManagePeople({ group, members, user, onClose, onLeave }) {
  const [email, setEmail] = useState('')
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
    try { await db.removeMember(group.team_id, m.membership_id); logActivity(group, myName, `removed ${m.display_name}`); onClose() }
    catch (e2) { setErr(e2.message) }
  }
  async function leave() {
    try { await db.leaveGroup(group.team_id, myMembership.membership_id); onLeave() } catch (e2) { setErr(e2.message) }
  }
  async function del() {
    try { await db.deleteGroup(group); onLeave() } catch (e2) { setErr(e2.message) }
  }

  return (
    <Sheet title="People & settings" onClose={onClose}>
      {group.join_code && <>
        <div className="note">Share this code — people tap “Join by code” to join instantly.</div>
        <div className="codebig">{group.join_code}</div>
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
            <div className="grow">{m.display_name}{m.user_id === user.id && ' (you)'}{!m.confirmed && <span className="faint tiny"> · invited</span>}</div>
            {m.user_id !== user.id && <button className="del" title={'Remove ' + m.display_name} onClick={() => remove(m)}><Ic.trash /></button>}
          </div>
        ))}
      </div>

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

function CodeChip({ code }) {
  const [done, setDone] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(code); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* ignore */ } }
  return <button className="codepill" onClick={copy} title="Copy invite code">Code <b>{code}</b> {done ? <Ic.check /> : <Ic.copy />}</button>
}

function ExpenseList({ members, expenses, splits, cur, me, onOpen }) {
  if (!expenses.length) return <div className="empty">No expenses yet.<br />Tap “Add expense” to start.</div>
  return (
    <div className="card list">
      {expenses.map(e => {
        const mine = splits.find(s => s.expense_id === e.id && s.member_id === me)?.owed_cents || 0
        const lent = e.amount_cents - mine
        const iPaid = e.paid_by === me
        return (
          <button className="row rowbtn" key={e.id} onClick={() => onOpen(e)}>
            <div className="badge">{CATS[e.category] || '🧾'}</div>
            <div className="grow"><b className="truncate">{e.description}</b>
              <div className="muted tiny">{nameOf(members, e.paid_by)} paid {money(e.amount_cents, cur)}{e.spent_on ? ' · ' + fmtDate(e.spent_on) : ''}</div></div>
            <div className="right">
              {iPaid
                ? <><div className="tiny muted">you lent</div><div className="num pos">{money(lent, cur)}</div></>
                : <><div className="tiny muted">you borrowed</div><div className="num neg">{money(mine, cur)}</div></>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- Add / edit expense ---------------- */
function AddExpense({ group, members, user, onClose, edit, editSplits }) {
  const [desc, setDesc] = useState(edit?.description || '')
  const [amount, setAmount] = useState(edit ? (edit.amount_cents / 100).toFixed(2) : '')
  const [paidBy, setPaidBy] = useState(edit?.paid_by || user.id)
  const [cat, setCat] = useState(edit?.category || 'general')
  const [date, setDate] = useState(edit?.spent_on || todayISO())
  const [type, setType] = useState(edit ? 'exact' : 'equal')
  const [picks, setPicks] = useState(edit && editSplits?.length ? editSplits.map(s => s.member_id) : members.map(m => m.user_id))
  const [vals, setVals] = useState(() => { const v = {}; if (edit && editSplits) editSplits.forEach(s => { v[s.member_id] = s.owed_cents }); return v })
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
    } catch { setErr('Couldn’t scan that image — enter it manually') }
    finally { setScan(0) }
  }

  const toggle = id => setPicks(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const setVal = (id, v) => setVals(s => ({ ...s, [id]: type === 'exact' ? toCents(v) : (parseFloat(v) || 0) }))

  let remain = null
  if (type === 'equal') remain = { ok: picks.length > 0, text: `${money(picks.length ? Math.round(amt / picks.length) : 0, cur)} each` }
  else {
    const sum = picks.reduce((s, id) => s + (vals[id] || 0), 0)
    if (type === 'exact') remain = { ok: sum === amt && amt > 0, text: `${money(sum, cur)} of ${money(amt, cur)}${sum === amt ? ' ✓' : ` (${money(amt - sum, cur)} left)`}` }
    else if (type === 'percent') remain = { ok: Math.abs(sum - 100) < 0.001, text: `${sum.toFixed(1)}%${Math.abs(sum - 100) < 0.001 ? ' ✓' : ''}` }
    else remain = { ok: sum > 0, text: `${sum} shares` }
  }

  async function save() {
    setErr('')
    if (!desc.trim()) return setErr('Add a description')
    if (amt <= 0) return setErr('Enter an amount')
    if (!picks.length) return setErr('Pick who shares this')
    if (!remain.ok) return setErr('Split does not add up yet')
    setBusy(true)
    const owed = splitsFromDraft({ amount: amt, type, picks, vals, payer: paidBy })
    const payload = { description: desc.trim(), amount_cents: amt, paid_by: paidBy, category: cat, spent_on: date, owed }
    try {
      if (edit) await db.updateExpense(group, edit.id, payload)
      else await db.addExpense(group, payload, user.id)
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
          {scan > 0 && <div className="bar" style={{ marginTop: 8 }}><div className="bar-fill" style={{ transform: `scaleX(${scan / 100})` }} /></div>}
        </div>
      </div>}
      <label className="fld"><span>Description</span><input className="inp" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Dinner" autoFocus /></label>
      <div className="two">
        <label className="fld"><span>Amount ({cur})</span><input className="inp" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
        <label className="fld"><span>Paid by</span>
          <select className="inp" value={paidBy} onChange={e => setPaidBy(e.target.value)}>
            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label>
      </div>
      <div className="two">
        <label className="fld"><span>Category</span>
          <select className="inp" value={cat} onChange={e => setCat(e.target.value)}>
            {Object.keys(CATS).map(c => <option key={c} value={c}>{CATS[c]} {c}</option>)}</select></label>
        <label className="fld"><span>Date</span>
          <input className="inp" type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)} /></label>
      </div>

      <div className="eyebrow">Split</div>
      <div className="seg">
        {[['equal', '='], ['exact', '123'], ['percent', '%'], ['shares', '⚖']].map(([t, l]) =>
          <button key={t} aria-selected={type === t} onClick={() => setType(t)}>{l}</button>)}
      </div>
      <div className="members">
        {members.map(m => (
          <div className="mrow" key={m.user_id}>
            <input type="checkbox" checked={picks.includes(m.user_id)} onChange={() => toggle(m.user_id)} />
            <Avatar members={members} id={m.user_id} />
            <div className="grow">{m.display_name}</div>
            {type !== 'equal' && picks.includes(m.user_id) &&
              <input className="inp val" inputMode="decimal" defaultValue={type === 'exact' && vals[m.user_id] ? (vals[m.user_id] / 100).toFixed(2) : (vals[m.user_id] || '')}
                placeholder={type === 'percent' ? '%' : type === 'shares' ? 'shares' : cur} onChange={e => setVal(m.user_id, e.target.value)} />}
          </div>
        ))}
      </div>

      <div className={'remain ' + (remain.ok ? 'ok' : 'bad')}><span>Split</span><span>{remain.text}</span></div>
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
  const [err, setErr] = useState('')
  const cur = group.currency

  async function record() {
    const a = toCents(amount)
    if (a <= 0) return setErr('Enter an amount')
    if (from === to) return setErr('Pick two different people')
    try {
      await db.addSettlement(group, { from_member: from, to_member: to, amount_cents: a })
      logActivity(group, displayName(user), `${nameOf(members, from)} paid ${nameOf(members, to)} ${money(a, cur)}`)
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
function Charts({ expenses, cur, members }) {
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
      <div className="stats">
        <div className="stat"><div className="stat-num num">{money(total, cur)}</div><div className="stat-lbl">total spent</div></div>
        <div className="stat"><div className="stat-num num">{count}</div><div className="stat-lbl">expenses</div></div>
        <div className="stat"><div className="stat-num num">{money(avg, cur)}</div><div className="stat-lbl">avg / expense</div></div>
        <div className="stat"><div className="stat-num">{CATS[topCat?.name] || '🧾'} {topCat?.name || '—'}</div><div className="stat-lbl">top category</div></div>
      </div>

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

function GroupActivityTab({ activity, expenses, cur, members }) {
  return (
    <>
      <Charts expenses={expenses} cur={cur} members={members} />
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
function ExpenseDetail({ group, members, user, expense, splits, onClose, onEdit }) {
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
    try { await db.deleteExpense(expense.id); logActivity(group, myName, `deleted “${expense.description}”`); onClose() } catch { /* ignore */ }
  }

  return (
    <Sheet title={expense.description} onClose={onClose}>
      <div className="detail-head">
        <div className="badge big">{CATS[expense.category] || '🧾'}</div>
        <div>
          <div className="detail-amt num">{money(expense.amount_cents, cur)}</div>
          <div className="muted tiny">{nameOf(members, expense.paid_by)} paid{expense.spent_on ? ' · ' + fmtDate(expense.spent_on) : ''}</div>
        </div>
      </div>
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
  return (
    <div className="sheet-bg" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sheet">
        <div className="sheet-head"><h2>{title}</h2><button className="icon-btn" aria-label="Close" onClick={onClose}><Ic.close /></button></div>
        {children}
      </div>
    </div>
  )
}
