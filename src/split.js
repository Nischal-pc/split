// Money is integer cents everywhere. Split engine + balance math. No floats stored.

// Split `amount` by weights; leftover cents go to the payer first, then others.
// weights: [{id, w}]. Returns {id: owedCents} summing exactly to amount.
export function allocate(amount, weights, payer) {
  const total = weights.reduce((s, m) => s + m.w, 0)
  if (total <= 0) return {}
  const out = {}
  let used = 0
  for (const m of weights) { const c = Math.floor((amount * m.w) / total); out[m.id] = c; used += c }
  let rem = amount - used
  const order = [payer, ...weights.map(m => m.id).filter(id => id !== payer)].filter(id => id in out)
  for (let i = 0; rem > 0; i++, rem--) out[order[i % order.length]]++
  return out
}

// Net per member. Positive = is owed money; negative = owes.
export function computeNets(members, expenses, splits, settlements) {
  const n = {}
  members.forEach(m => { n[m.user_id] = 0 })
  expenses.forEach(e => { if (n[e.paid_by] != null) n[e.paid_by] += e.amount_cents })
  splits.forEach(s => { if (n[s.member_id] != null) n[s.member_id] -= s.owed_cents })
  settlements.forEach(s => {
    if (n[s.from_member] != null) n[s.from_member] += s.amount_cents
    if (n[s.to_member] != null) n[s.to_member] -= s.amount_cents
  })
  return n
}

// Greedy simplification: biggest debtor pays biggest creditor. At most members-1 transfers.
export function simplify(nets) {
  const deb = [], cred = []
  for (const id in nets) { if (nets[id] < 0) deb.push([id, -nets[id]]); else if (nets[id] > 0) cred.push([id, nets[id]]) }
  deb.sort((a, b) => b[1] - a[1]); cred.sort((a, b) => b[1] - a[1])
  const res = []
  let i = 0, j = 0
  while (i < deb.length && j < cred.length) {
    const pay = Math.min(deb[i][1], cred[j][1])
    if (pay > 0) res.push({ from: deb[i][0], to: cred[j][0], amount: pay })
    deb[i][1] -= pay; cred[j][1] -= pay
    if (deb[i][1] === 0) i++
    if (cred[j][1] === 0) j++
  }
  return res
}

// Build {memberId: owedCents} from an add-expense draft.
// type: equal | exact | percent | shares. vals: {memberId:number} (cents for exact, else weight).
export function splitsFromDraft({ amount, type, picks, vals, payer }) {
  if (type === 'exact') { const out = {}; picks.forEach(id => { out[id] = vals[id] || 0 }); return out }
  const weight = id => (type === 'equal' ? 1 : (vals[id] || 0))
  return allocate(amount, picks.map(id => ({ id, w: weight(id) })), payer)
}

export const toCents = v => Math.round(parseFloat(v || 0) * 100) || 0
export const money = (c, cur = '$') => (c < 0 ? '-' : '') + cur + (Math.abs(c) / 100).toFixed(2)

// Parse OCR'd receipt text into {amount (cents), merchant}. Best-effort heuristic.
export function parseReceipt(text) {
  const lines = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const amtRe = /(\d{1,6})[.,](\d{2})(?!\d)/
  const amtReG = /(\d{1,6})[.,](\d{2})(?!\d)/g
  const all = []
  for (const l of lines) for (const x of l.match(amtReG) || []) { const m = x.match(amtRe); all.push(+m[1] * 100 + +m[2]) }
  // prefer a "total" line (but not subtotal)
  let total = 0
  for (const l of lines) {
    if (/sub\s*-?\s*total/i.test(l)) continue
    if (/\b(total|amount due|balance due|grand total|total due)\b/i.test(l)) {
      const hits = [...l.matchAll(amtReG)]
      if (hits.length) { const c = +hits.at(-1)[1] * 100 + +hits.at(-1)[2]; if (c > total) total = c }
    }
  }
  if (!total && all.length) total = Math.max(...all)
  // merchant: first line that's mostly letters and not an amount/date
  let merchant = ''
  for (const l of lines) {
    if (amtRe.test(l) || /\d{1,2}[/-]\d{1,2}/.test(l)) continue
    if (/[a-zA-Z]{3,}/.test(l) && l.length <= 32) { merchant = l; break }
  }
  merchant = merchant.replace(/[^\w &'-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
  if (merchant) merchant = merchant.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  return { amount: total, merchant }
}

// Next occurrence of a recurring expense. Monthly clamps to month end (Jan 31 -> Feb 28).
export function nextDate(iso, repeat) {
  const [y, m, d] = iso.split('-').map(Number)
  if (repeat === 'weekly') return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10)
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate() // last day of next month
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10)
}

// Occurrence dates that are due (<= today), starting at next_on. Capped so a stale template can't explode.
export function dueDates(nextOn, repeat, today, cap = 24) {
  const out = []
  for (let d = nextOn; d && d <= today && out.length < cap; d = nextDate(d, repeat)) out.push(d)
  return out
}

// Search + filter expenses by text (description/notes), category and payer.
export function filterExpenses(expenses, { q = '', cat = '', who = '' } = {}) {
  const t = q.trim().toLowerCase()
  return expenses.filter(e =>
    (!t || (e.description || '').toLowerCase().includes(t) || (e.notes || '').toLowerCase().includes(t)) &&
    (!cat || e.category === cat) && (!who || e.paid_by === who))
}

// Overall balance with each person across every group, per currency.
// Uses each group's simplified "who owes who" so Home matches what the group screens show.
// groups: [{ name, currency, members, expenses, splits, settlements }]
// Returns [{ user_id, name, cur, net, groups }] — net > 0: they owe me; net < 0: I owe them. Zero balances dropped.
export function peopleBalances(me, groups) {
  const acc = {}
  for (const g of groups) {
    for (const s of simplify(computeNets(g.members, g.expenses, g.splits, g.settlements))) {
      const other = s.from === me ? s.to : s.to === me ? s.from : null
      if (!other) continue
      const key = other + '|' + g.currency
      const name = g.members.find(m => m.user_id === other)?.display_name || 'Someone'
      const p = acc[key] ||= { user_id: other, name, cur: g.currency, net: 0, groups: [] }
      p.net += s.to === me ? s.amount : -s.amount
      if (!p.groups.includes(g.name)) p.groups.push(g.name)
    }
  }
  return Object.values(acc).filter(p => p.net !== 0).sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
}
