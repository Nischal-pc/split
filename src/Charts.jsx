import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, AreaChart, Area, CartesianGrid } from 'recharts'
import { money } from './split.js'
import { CATS, COLORS, Ic, nameOf, fmtDate } from './App.jsx'

// Reusable chart block. Pass `members` to also show the "Who paid" bar.
export default function Charts({ expenses, cur, members, stats = true }) {
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
    // quote every cell; text starting with = + - @ would run as a formula in Excel/Sheets (CSV injection)
    const esc = v => { let t = String(v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"' }
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
              <XAxis dataKey="date" padding={{ left: 20, right: 20 }} tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} />
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
