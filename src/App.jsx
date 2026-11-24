import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { computeNets, simplify, splitsFromDraft, toCents, money } from './split.js'

const CATS = { general: '🧾', food: '🍽️', transport: '🚕', home: '🏠', trip: '✈️', fun: '🎉', shopping: '🛍️' }
const COLORS = ['#2f7d4f', '#c0492f', '#2b6fb0', '#9a5bbf', '#b8791f', '#1f998f', '#c0497f', '#5a6b2f']
const nameOf = (members, id) => members.find(m => m.user_id === id)?.display_name || '?'
const colorOf = (members, id) => COLORS[Math.max(0, members.findIndex(m => m.user_id === id)) % COLORS.length]

/* drawn icons (one consistent 1.9 stroke) */
const Svg = p => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p} />
const Ic = {
  moon: () => <Svg><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Svg>,
  logout: () => <Svg><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Svg>,
  back: () => <Svg width="18" height="18"><path d="M15 18l-6-6 6-6" /></Svg>,
  close: () => <Svg><path d="M18 6 6 18M6 6l12 12" /></Svg>,
  send: () => <Svg width="18" height="18"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></Svg>,
  copy: () => <Svg width="15" height="15"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>,
  check: () => <Svg width="15" height="15"><path d="M20 6 9 17l-5-5" /></Svg>,
  chev: () => <Svg><path d="M9 18l6-6-6-6" /></Svg>,
  alert: () => <Svg width="16" height="16"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></Svg>,
  trash: () => <Svg width="17" height="17"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></Svg>,
  edit: () => <Svg width="16" height="16"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></Svg>,
  exit: () => <Svg width="17" height="17"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></Svg>,
  download: () => <Svg width="17" height="17"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5M12 15V3" /></Svg>,
}
const displayName = user => user.user_metadata?.display_name || user.email
async function logActivity(groupId, actorName, text) {
  await supabase.from('activity').insert({ group_id: groupId, actor_name: actorName, text }) // no-op if table absent
}
const todayISO = () => new Date().toISOString().slice(0, 10)
const fmtDate = d => d ? new Date(d + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

export default function App() {
  const [session, setSession] = useState(undefined)
  const [groupId, setGroupId] = useState(null)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="center">Loading…</div>
  if (recovery) return <ResetPassword onDone={() => setRecovery(false)} />
  if (!session) return <Auth />
  return (
    <>
      <Header user={session.user} />
      {groupId
        ? <GroupView groupId={groupId} user={session.user} onBack={() => setGroupId(null)} />
        : <Home user={session.user} onOpen={setGroupId} />}
    </>
  )
}

function Header({ user }) {
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
        <button className="icon-btn" title="Sign out" aria-label="Sign out" onClick={() => supabase.auth.signOut()}><Ic.logout /></button>
      </div>
    </header>
  )
}

/* ---------------- Auth ---------------- */
function Auth() {
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
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email, password: pass, options: { data: { display_name: name || email.split('@')[0] } },
        })
        if (error) throw error
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw error
        setSent(true)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
        if (error) throw error
      }
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
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
          <form onSubmit={submit}>
            {mode === 'signup' && (
              <label className="fld"><span>Your name</span>
                <input className="inp" value={name} onChange={e => setName(e.target.value)} placeholder="Alex" autoComplete="name" /></label>
            )}
            <label className="fld"><span>Email</span>
              <input className="inp" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
            {mode !== 'forgot' && (
              <label className="fld"><span>Password</span>
                <input className="inp" type="password" required minLength={6} value={pass} onChange={e => setPass(e.target.value)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label>
            )}
            {mode === 'login' && (
              <div className="linkrow"><button type="button" onClick={() => go('forgot')}>Forgot password?</button></div>
            )}
            {err && <div className="err"><Ic.alert />{err}</div>}
            <button className="btn block" disabled={busy}>{busy ? 'Please wait…' : cta}</button>
          </form>
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

/* ---------------- Reset password (after email recovery link) ---------------- */
function ResetPassword({ onDone }) {
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e) {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pass })
    setBusy(false)
    if (error) return setErr(error.message)
    onDone()
  }
  return (
    <div className="authwrap">
      <div className="authhero"><div className="logo">S</div><h2>Set a new password</h2><p>Almost there.</p></div>
      <div className="authbody">
        <form onSubmit={save}>
          <label className="fld"><span>New password</span>
            <input className="inp" type="password" required minLength={6} value={pass} onChange={e => setPass(e.target.value)} autoComplete="new-password" autoFocus /></label>
          {err && <div className="err"><Ic.alert />{err}</div>}
          <button className="btn block" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
        </form>
      </div>
    </div>
  )
}

/* ---------------- Home: groups list ---------------- */
function Home({ user, onOpen }) {
  const [groups, setGroups] = useState(null)
  const [sheet, setSheet] = useState(null) // 'new' | 'join'

  async function load() {
    const { data: gm } = await supabase.from('group_members').select('groups(*)').eq('user_id', user.id)
    const gs = (gm || []).map(r => r.groups).filter(Boolean)
    // My net per group. RLS already limits these rows to groups I belong to.
    const [exp, spl, set] = await Promise.all([
      supabase.from('expenses').select('group_id,paid_by,amount_cents'),
      supabase.from('expense_splits').select('group_id,member_id,owed_cents'),
      supabase.from('settlements').select('group_id,from_member,to_member,amount_cents'),
    ])
    const net = {}; gs.forEach(g => { net[g.id] = 0 })
    ;(exp.data || []).forEach(e => { if (e.paid_by === user.id && net[e.group_id] != null) net[e.group_id] += e.amount_cents })
    ;(spl.data || []).forEach(s => { if (s.member_id === user.id && net[s.group_id] != null) net[s.group_id] -= s.owed_cents })
    ;(set.data || []).forEach(s => { if (net[s.group_id] == null) return; if (s.from_member === user.id) net[s.group_id] += s.amount_cents; if (s.to_member === user.id) net[s.group_id] -= s.amount_cents })
    setGroups(gs.map(g => ({ ...g, myNet: net[g.id] || 0 })).sort((a, b) => a.name.localeCompare(b.name)))
  }
  useEffect(() => { load() }, [])

  const myName = displayName(user)

  return (
    <main className="wrap">
      <div className="eyebrow mt">Your groups</div>
      {groups === null ? <div className="muted pad">Loading…</div>
        : groups.length === 0 ? <div className="empty"><div className="big">🧾</div>No groups yet.<br />Create one or join with a code.</div>
          : <div className="card list">
            {groups.map(g => (
              <button key={g.id} className="row rowbtn" onClick={() => onOpen(g.id)}>
                <div className="badge">👥</div>
                <div className="grow"><b>{g.name}</b>
                  <div className={'tiny ' + (g.myNet > 0 ? 'pos' : g.myNet < 0 ? 'neg' : 'muted')}>
                    {g.myNet === 0 ? 'settled up' : g.myNet > 0 ? `you are owed ${money(g.myNet, g.currency)}` : `you owe ${money(-g.myNet, g.currency)}`}
                  </div>
                </div>
                <div className="chev"><Ic.chev /></div>
              </button>
            ))}
          </div>}

      <div className="actionbar">
        <button className="btn ghost" onClick={() => setSheet('join')}>Join by code</button>
        <button className="btn" onClick={() => setSheet('new')}>+ New group</button>
      </div>

      {sheet === 'new' && <NewGroup myName={myName} user={user} onClose={() => setSheet(null)} onDone={id => { setSheet(null); onOpen(id) }} />}
      {sheet === 'join' && <JoinGroup myName={myName} onClose={() => setSheet(null)} onDone={id => { setSheet(null); onOpen(id) }} />}
    </main>
  )
}

function NewGroup({ myName, user, onClose, onDone }) {
  const [name, setName] = useState('')
  const [cur, setCur] = useState('$')
  const [err, setErr] = useState('')
  async function create() {
    if (!name.trim()) return
    // Generate the id client-side and insert without reading back, so no SELECT policy is hit
    // before our membership row exists (that read-back was the original bug).
    const id = crypto.randomUUID()
    const { error } = await supabase.from('groups')
      .insert({ id, name: name.trim(), currency: cur.trim() || '$', created_by: user.id })
    if (error) return setErr(error.message)
    const { error: e2 } = await supabase.from('group_members')
      .insert({ group_id: id, user_id: user.id, display_name: myName })
    if (e2) return setErr(e2.message)
    onDone(id)
  }
  return (
    <Sheet title="New group" onClose={onClose}>
      <label className="fld"><span>Group name</span><input className="inp" value={name} onChange={e => setName(e.target.value)} placeholder="Flatmates" autoFocus /></label>
      <label className="fld"><span>Currency symbol</span><input className="inp" style={{ width: 90 }} value={cur} onChange={e => setCur(e.target.value)} maxLength={3} /></label>
      {err && <div className="err">{err}</div>}
      <button className="btn block" onClick={create}>Create group</button>
    </Sheet>
  )
}

function JoinGroup({ myName, onClose, onDone }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  async function join() {
    const { data, error } = await supabase.rpc('join_group', { p_code: code.trim(), p_name: myName })
    if (error) return setErr(error.message)
    onDone(data)
  }
  return (
    <Sheet title="Join a group" onClose={onClose}>
      <label className="fld"><span>Share code</span><input className="inp" value={code} onChange={e => setCode(e.target.value)} placeholder="ABC123" autoFocus style={{ textTransform: 'uppercase' }} /></label>
      {err && <div className="err">{err}</div>}
      <button className="btn block" onClick={join}>Join</button>
    </Sheet>
  )
}

/* ---------------- Group view ---------------- */
function GroupView({ groupId, user, onBack }) {
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [expenses, setExpenses] = useState([])
  const [splits, setSplits] = useState([])
  const [settlements, setSettlements] = useState([])
  const [activity, setActivity] = useState([])
  const [sheet, setSheet] = useState(null)
  const [tab, setTab] = useState('expenses') // expenses | activity | chat

  async function load() {
    const [g, mem, exp, spl, set, act] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).single(),
      supabase.from('group_members').select('user_id,display_name').eq('group_id', groupId),
      supabase.from('expenses').select('*').eq('group_id', groupId).order('created_at', { ascending: false }),
      supabase.from('expense_splits').select('*').eq('group_id', groupId),
      supabase.from('settlements').select('*').eq('group_id', groupId).order('created_at', { ascending: false }),
      supabase.from('activity').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(60),
    ])
    if (g.data) setGroup(g.data)
    setMembers(mem.data || []); setExpenses(exp.data || []); setSplits(spl.data || []); setSettlements(set.data || []); setActivity(act.data || [])
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('group-' + groupId)
    for (const t of ['expenses', 'expense_splits', 'settlements', 'group_members', 'activity']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `group_id=eq.${groupId}` }, load)
    }
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [groupId])

  if (!group) return <main className="wrap"><div className="muted pad">Loading…</div></main>
  const cur = group.currency
  const nets = computeNets(members, expenses, splits, settlements)
  const suggestions = simplify(nets)

  return (
    <main className="wrap">
      <button className="back" onClick={onBack}><Ic.back /> Groups</button>
      <div className="ghead">
        <h2>{group.name}</h2>
        <div className="members">{members.map(m => m.display_name).join(' · ')}</div>
        <div className="ghead-actions">
          <ShareCode code={group.join_code} />
          <button className="btn ghost sm" onClick={() => setSheet('people')}>+ Add people</button>
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
              <div className="grow">{m.display_name}{m.user_id === user.id && ' (you)'}</div>
              <div className={'num ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted')}>
                {v === 0 ? 'settled' : (v > 0 ? '+' : '') + money(v, cur)}
              </div>
            </div>
          )
        })}
      </div>

      {suggestions.length > 0 && <>
        <div className="eyebrow mt">Suggested payments</div>
        <div className="card list">
          {suggestions.map((s, i) => (
            <div className="row" key={i}>
              <Avatar members={members} id={s.from} />
              <div className="grow"><b>{nameOf(members, s.from)}</b> → <b>{nameOf(members, s.to)}</b></div>
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
      {tab === 'activity' && <ActivityTab activity={activity} expenses={expenses} cur={cur} />}
      {tab === 'chat' && <Chat groupId={groupId} user={user} members={members} />}

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
  if (net === 0) return <div className="mybal settled">You’re all settled up 🎉</div>
  const owed = net > 0
  return (
    <div className={'mybal ' + (owed ? 'owed' : 'owe')}>
      <span className="mybal-label">{owed ? 'Overall, you are owed' : 'Overall, you owe'}</span>
      <b className="num mybal-amt">{money(Math.abs(net), cur)}</b>
    </div>
  )
}

function ManagePeople({ group, members, user, onClose, onLeave }) {
  const [email, setEmail] = useState('')
  const [result, setResult] = useState(undefined) // undefined=unsearched, null=not found, object=found
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const myName = displayName(user)
  const isCreator = group.created_by === user.id
  const needs2 = 'Run supabase/migrations/0002_people.sql once to enable email search. The invite code above works now.'
  const needs3 = 'Run supabase/migrations/0003_features.sql once to enable this.'

  async function search(e) {
    e.preventDefault(); setErr(''); setResult(undefined); setBusy(true)
    const { data, error } = await supabase.rpc('find_user_by_email', { p_email: email })
    setBusy(false)
    if (error) return setErr(error.code === 'PGRST202' ? needs2 : error.message)
    setResult((data && data[0]) || null)
  }
  async function add() {
    if (members.some(m => m.user_id === result.id)) return setErr(result.display_name + ' is already in this group')
    const { error } = await supabase.from('group_members').insert({ group_id: group.id, user_id: result.id, display_name: result.display_name })
    if (error) return setErr(error.code === '42501' ? needs2 : error.message)
    logActivity(group.id, myName, `added ${result.display_name}`)
    onClose()
  }
  async function remove(m) {
    const { error } = await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', m.user_id)
    if (error) return setErr(error.code === '42501' ? needs3 : error.message)
    logActivity(group.id, myName, `removed ${m.display_name}`)
    onClose()
  }
  async function leave() {
    const { error } = await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', user.id)
    if (error) return setErr(error.message)
    onLeave()
  }
  async function del() {
    const { error } = await supabase.from('groups').delete().eq('id', group.id)
    if (error) return setErr(error.code === '42501' ? needs3 : error.message)
    onLeave()
  }

  return (
    <Sheet title="People" onClose={onClose}>
      <div className="note">Share this code — anyone can sign up and tap “Join by code”.</div>
      <div className="codebig">{group.join_code}</div>

      <div className="eyebrow mt">Add someone already registered</div>
      <form onSubmit={search}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input className="inp" style={{ flex: 1 }} type="email" placeholder="friend@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn" disabled={busy || !email}>{busy ? '…' : 'Find'}</button>
        </div>
      </form>
      {result === null && <div className="note mt">No account with that email yet — share the code above.</div>}
      {result && (
        <div className="card row mt">
          <Avatar members={[{ user_id: result.id, display_name: result.display_name }]} id={result.id} />
          <div className="grow"><b>{result.display_name}</b></div>
          <button className="btn sm" onClick={add}>Add</button>
        </div>
      )}

      <div className="eyebrow mt">In this group</div>
      <div className="card list">
        {members.map(m => (
          <div className="row" key={m.user_id}>
            <Avatar members={members} id={m.user_id} />
            <div className="grow">{m.display_name}{m.user_id === user.id && ' (you)'}</div>
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
      </div>
    </Sheet>
  )
}

function ShareCode({ code }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  return <button className="codepill" onClick={copy}>Invite code <b>{code}</b> {copied ? <Ic.check /> : <Ic.copy />}</button>
}

function Avatar({ members, id }) {
  return <div className="avatar" style={{ background: colorOf(members, id) }}>{nameOf(members, id).slice(0, 1).toUpperCase()}</div>
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
  // When editing, start from the stored amounts as an "exact" split the user can tweak or re-type.
  const [type, setType] = useState(edit ? 'exact' : 'equal')
  const [picks, setPicks] = useState(edit && editSplits?.length ? editSplits.map(s => s.member_id) : members.map(m => m.user_id))
  const [vals, setVals] = useState(() => {
    const v = {}; if (edit && editSplits) editSplits.forEach(s => { v[s.member_id] = s.owed_cents }); return v
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const cur = group.currency
  const amt = toCents(amount)
  const myName = displayName(user)

  const toggle = id => setPicks(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const setVal = (id, v) => setVals(s => ({ ...s, [id]: type === 'exact' ? toCents(v) : (parseFloat(v) || 0) }))

  // live remaining
  let remain = null
  if (type === 'equal') remain = { ok: picks.length > 0, text: `${money(picks.length ? Math.round(amt / picks.length) : 0, cur)} each` }
  else {
    const sum = picks.reduce((s, id) => s + (vals[id] || 0), 0)
    if (type === 'exact') remain = { ok: sum === amt && amt > 0, text: `${money(sum, cur)} of ${money(amt, cur)}${sum === amt ? ' ✓' : ` (${money(amt - sum, cur)} left)`}` }
    else if (type === 'percent') remain = { ok: Math.abs(sum - 100) < 0.001, text: `${sum.toFixed(1)}%${Math.abs(sum - 100) < 0.001 ? ' ✓' : ''}` }
    else remain = { ok: sum > 0, text: `${sum} shares` }
  }

  // Insert/update with spent_on, retrying without it if the column isn't in the DB yet (pre-0003).
  async function writeExpense() {
    const base = { group_id: group.id, description: desc.trim(), amount_cents: amt, paid_by: paidBy, category: cat }
    const full = { ...base, spent_on: date }
    const missingCol = e => e && (e.code === 'PGRST204' || e.code === '42703')
    if (edit) {
      let r = await supabase.from('expenses').update(full).eq('id', edit.id)
      if (missingCol(r.error)) r = await supabase.from('expenses').update(base).eq('id', edit.id)
      return r.error ? { error: r.error } : { id: edit.id }
    }
    let r = await supabase.from('expenses').insert({ ...full, created_by: user.id }).select().single()
    if (missingCol(r.error)) r = await supabase.from('expenses').insert({ ...base, created_by: user.id }).select().single()
    return r.error ? { error: r.error } : { id: r.data.id }
  }

  async function save() {
    setErr('')
    if (!desc.trim()) return setErr('Add a description')
    if (amt <= 0) return setErr('Enter an amount')
    if (!picks.length) return setErr('Pick who shares this')
    if (!remain.ok) return setErr('Split does not add up yet')
    setBusy(true)
    const owed = splitsFromDraft({ amount: amt, type, picks, vals, payer: paidBy })
    const res = await writeExpense()
    if (res.error) { setBusy(false); return setErr(res.error.code === '42501' ? 'Run supabase/migrations/0003_features.sql to enable editing.' : res.error.message) }
    if (edit) await supabase.from('expense_splits').delete().eq('expense_id', res.id)
    const rows = picks.map(id => ({ expense_id: res.id, group_id: group.id, member_id: id, owed_cents: owed[id] || 0 }))
    const { error: e2 } = await supabase.from('expense_splits').insert(rows)
    if (e2) { setBusy(false); return setErr(e2.message) }
    logActivity(group.id, myName, `${edit ? 'edited' : 'added'} “${desc.trim()}” · ${money(amt, cur)}`)
    onClose()
  }

  return (
    <Sheet title={edit ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <label className="fld"><span>Description</span><input className="inp" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Dinner" autoFocus /></label>
      <div className="two">
        <label className="fld"><span>Amount ({cur})</span><input className="inp" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
        <label className="fld"><span>Paid by</span>
          <select className="inp" value={paidBy} onChange={e => setPaidBy(e.target.value)}>
            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
          </select></label>
      </div>
      <div className="two">
        <label className="fld"><span>Category</span>
          <select className="inp" value={cat} onChange={e => setCat(e.target.value)}>
            {Object.keys(CATS).map(c => <option key={c} value={c}>{CATS[c]} {c}</option>)}
          </select></label>
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
              <input className="inp val" inputMode="decimal"
                placeholder={type === 'percent' ? '%' : type === 'shares' ? 'shares' : cur}
                onChange={e => setVal(m.user_id, e.target.value)} />}
          </div>
        ))}
      </div>

      <div className={'remain ' + (remain.ok ? 'ok' : 'bad')}><span>Split</span><span>{remain.text}</span></div>
      {err && <div className="err">{err}</div>}
      <button className="btn block" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</button>
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
    const { error } = await supabase.from('settlements')
      .insert({ group_id: group.id, from_member: from, to_member: to, amount_cents: a })
    if (error) return setErr(error.message)
    logActivity(group.id, displayName(user), `${nameOf(members, from)} paid ${nameOf(members, to)} ${money(a, cur)}`)
    onClose()
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
      {err && <div className="err">{err}</div>}
      <button className="btn block" onClick={record}>Record payment</button>
    </Sheet>
  )
}

/* ---------------- Realtime chat ---------------- */
function Chat({ groupId, user, members }) {
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const endRef = useRef(null)
  const myName = user.user_metadata?.display_name || user.email

  useEffect(() => {
    supabase.from('messages').select('*').eq('group_id', groupId).order('created_at').limit(200)
      .then(({ data }) => setMsgs(data || []))
    const ch = supabase.channel('chat-' + groupId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` },
        p => setMsgs(m => m.some(x => x.id === p.new.id) ? m : [...m, p.new]))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [groupId])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  async function send(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setText('')
    await supabase.from('messages').insert({ group_id: groupId, user_id: user.id, display_name: myName, body })
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
function ActivityTab({ activity, expenses, cur }) {
  const byCat = {}
  expenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount_cents })
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1])
  const total = cats.reduce((s, c) => s + c[1], 0)
  const max = cats.length ? cats[0][1] : 1

  function exportCsv() {
    const esc = v => '"' + String(v).replace(/"/g, '""') + '"'
    const lines = ['Date,Description,Category,Amount']
    expenses.forEach(e => lines.push([e.spent_on || '', esc(e.description || ''), e.category, (e.amount_cents / 100).toFixed(2)].join(',')))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
    a.download = 'expenses.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <>
      {total > 0 && <>
        <div className="eyebrow between">Spending by category
          <button className="linklike" onClick={exportCsv}><Ic.download /> Export CSV</button></div>
        <div className="card pad insights">
          {cats.map(([c, amt]) => (
            <div className="insight" key={c}>
              <div className="insight-top"><span>{CATS[c] || '🧾'} {c}</span><span className="num">{money(amt, cur)}</span></div>
              <div className="bar"><div className="bar-fill" style={{ transform: `scaleX(${max ? amt / max : 0})` }} /></div>
            </div>
          ))}
          <div className="insight-total num">Total {money(total, cur)}</div>
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
function ExpenseDetail({ group, members, user, expense, splits, onClose, onEdit }) {
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const myName = displayName(user)
  const cur = group.currency

  useEffect(() => {
    supabase.from('comments').select('*').eq('expense_id', expense.id).order('created_at').then(({ data }) => setComments(data || []))
    const ch = supabase.channel('cmt-' + expense.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `expense_id=eq.${expense.id}` },
        p => setComments(c => c.some(x => x.id === p.new.id) ? c : [...c, p.new]))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [expense.id])

  async function send(e) {
    e.preventDefault(); const body = text.trim(); if (!body) return; setText('')
    await supabase.from('comments').insert({ group_id: group.id, expense_id: expense.id, user_id: user.id, display_name: myName, body })
  }
  async function del() {
    await supabase.from('expenses').delete().eq('id', expense.id)
    logActivity(group.id, myName, `deleted “${expense.description}”`)
    onClose()
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
