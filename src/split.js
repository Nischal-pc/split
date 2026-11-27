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

// Accepts "12.50", "12,50", "1,234.50" and "1.234,50": a comma followed by 1-2 digits is a decimal point.
export const toCents = v => {
  let s = String(v ?? '').replace(/[^\d.,-]/g, '')
  s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  return Math.round(parseFloat(s) * 100) || 0
}
export const money = (c, cur = '$') => (c < 0 ? '-' : '') + cur + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// The calendar day where the person is. toISOString() is UTC, which is already "tomorrow" on a Canadian evening.
export const localDay = (d = new Date()) => { const x = new Date(d); return [x.getFullYear(), x.getMonth() + 1, x.getDate()].map(n => String(n).padStart(2, '0')).join('-') }

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
// Returns [{ user_id, name, email, cur, net, groups, parts: [{ group, amount }] }] — net > 0: they owe me; net < 0: I owe them. Zero balances dropped.
export function peopleBalances(me, groups) {
  const acc = {}
  for (const g of groups) {
    for (const s of simplify(computeNets(g.members, g.expenses, g.splits, g.settlements))) {
      const other = s.from === me ? s.to : s.to === me ? s.from : null
      if (!other) continue
      const key = other + '|' + g.currency
      const m = g.members.find(x => x.user_id === other)
      const p = acc[key] ||= { user_id: other, name: m?.display_name || 'Someone', email: m?.email || '', cur: g.currency, net: 0, groups: [], parts: [] }
      const amt = s.to === me ? s.amount : -s.amount
      p.net += amt
      // open since: first expense after the last payment between the two of you in this group
      const day = x => String(x.spent_on || x.created_at || x.$createdAt || '').slice(0, 10)
      const lastPaid = g.settlements.filter(t => [t.from_member, t.to_member].includes(me) && [t.from_member, t.to_member].includes(other))
        .reduce((d, t) => (day(t) > d ? day(t) : d), '')
      const since = g.expenses.map(day).filter(d => d && d >= lastPaid).sort()[0]
      if (since && (!p.since || since < p.since)) p.since = since
      if (!p.groups.includes(g.name)) p.groups.push(g.name)
      // per-group piece, so "settle all" can record one payment in each group
      p.parts.push({ group: { id: g.id, team_id: g.team_id, name: g.name }, amount: amt })
    }
  }
  return Object.values(acc).filter(p => p.net !== 0).sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
}

// Itemized split: each item's price is shared equally by the people who had it; whatever the
// total has on top of the items (tax, tip) is shared in proportion to each person's items.
// items: [{ cents, people: [ids] }]. Returns { owed: {id: cents}, itemsTotal, ok }.
export function itemSplit(amount, items, payer) {
  const owed = {}
  let itemsTotal = 0
  for (const it of items) {
    if (!(it.cents > 0) || !it.people?.length) continue
    itemsTotal += it.cents
    const part = allocate(it.cents, it.people.map(id => ({ id, w: 1 })), it.people.includes(payer) ? payer : it.people[0])
    for (const id in part) owed[id] = (owed[id] || 0) + part[id]
  }
  const extra = amount - itemsTotal
  if (!itemsTotal || extra < 0) return { owed, itemsTotal, ok: false }
  if (extra > 0) {
    const add = allocate(extra, Object.entries(owed).map(([id, w]) => ({ id, w })), payer)
    for (const id in add) owed[id] += add[id]
  }
  return { owed, itemsTotal, ok: true }
}

// Pull "name ... price" lines out of OCR'd receipt text (skips totals, tax, payment lines).
export function parseReceiptItems(text) {
  const skip = /(sub\s*-?\s*total|total|tax|gst|hst|pst|vat|tip|gratuity|change|cash|visa|master|amex|debit|credit|balance|amount|due|paid|tender|card|auth|approved)/i
  const out = []
  for (const raw of (text || '').split(/\r?\n/)) {
    const l = raw.trim()
    const m = l.match(/^(.*?[a-zA-Z]{2,}.*?)\s+\$?\s?(\d{1,5})[.,](\d{2})\s*[A-Z]?$/)
    if (!m || skip.test(m[1])) continue
    const name = m[1].replace(/^\d+\s*(x\s*)?/i, '').replace(/[^\w &'/-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
    const cents = +m[2] * 100 + +m[3]
    if (name && cents > 0) out.push({ name, cents })
  }
  return out.slice(0, 30)
}

// Currencies the exchange-rate service supports (ECB reference rates).
export const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'INR', 'AUD', 'NZD', 'JPY', 'CNY', 'HKD', 'SGD', 'KRW', 'THB', 'PHP', 'IDR', 'MYR',
  'MXN', 'BRL', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'ISK', 'TRY', 'ILS', 'ZAR', 'RON']
// Best guess at a group's currency code from its symbol; '$' defaults to CAD (app runs in Canada). The person can change it.
export function guessCode(symbol) {
  const s = (symbol || '').trim().toUpperCase()
  if (CURRENCIES.includes(s)) return s
  return { '$': 'CAD', 'C$': 'CAD', 'US$': 'USD', '€': 'EUR', '£': 'GBP', '₹': 'INR', 'RS': 'INR', '¥': 'JPY', 'A$': 'AUD', '₩': 'KRW', '฿': 'THB', '₱': 'PHP', 'R$': 'BRL', '₺': 'TRY', '₪': 'ILS', 'ZŁ': 'PLN', 'CHF': 'CHF' }[s] || 'CAD'
}
// Convert cents at a rate (e.g. 1.5707), rounded to the nearest cent.
export const convertCents = (cents, rate) => Math.round(cents * rate)

// Your spending = your share of each expense (whoever paid). Settle-ups are paying people back, not spending.
// Returns one item per split of yours: { id, description, category, spent_on, group_id, amount_cents }.
export function myShares(me, expenses, splits) {
  const byId = Object.fromEntries(expenses.map(e => [e.id || e.$id, e]))
  const repeating = new Set(expenses.filter(e => e.repeat).map(e => e.group_id + '|' + e.description))
  const out = []
  for (const s of splits) {
    const e = s.member_id === me && byId[s.expense_id]
    if (!e || !(s.owed_cents > 0)) continue
    out.push({ id: s.expense_id, description: e.description, category: e.category, group_id: e.group_id, amount_cents: s.owed_cents,
      spent_on: e.spent_on || String(e.created_at || e.$createdAt || '').slice(0, 10),
      recurring: repeating.has(e.group_id + '|' + e.description) })
  }
  return out
}
export const monthOf = iso => String(iso || '').slice(0, 7) // 'YYYY-MM'
export function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
}
export const inMonth = (items, ym) => items.filter(i => monthOf(i.spent_on) === ym)
export const sumCents = items => items.reduce((s, i) => s + i.amount_cents, 0)

// Monthly budget status. spent/budget in cents; ym 'YYYY-MM'; today 'YYYY-MM-DD'.
// pace compares spending with the share of the month that has passed (only for the current month).
export function budgetStatus(spent, budget, ym, today) {
  const [y, m] = ym.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const current = today.slice(0, 7) === ym
  const day = current ? +today.slice(8, 10) : days
  const expected = Math.round(budget * day / days)
  const pace = spent > budget ? 'over' : current && spent > expected * 1.1 ? 'ahead' : 'ok'
  return { pct: budget ? spent / budget : 0, left: budget - spent, daysLeft: current ? days - day : 0, expected, pace }
}

// Everything the Insights screen shows for one month, in one currency.
// items: your shares (myShares) in that currency; expenses: full expenses of groups in that currency.
export function monthInsights({ me, ym, today, items, expenses }) {
  const these = inMonth(items, ym), prev = inMonth(items, shiftMonth(ym, -1))
  const total = sumCents(these)
  const byCat = list => list.reduce((a, i) => { a[i.category || 'general'] = (a[i.category || 'general'] || 0) + i.amount_cents; return a }, {})
  const now = byCat(these), before = byCat(prev)
  const categories = Object.keys({ ...now, ...before }).map(cat => ({ cat, cents: now[cat] || 0, delta: (now[cat] || 0) - (before[cat] || 0) }))
    .filter(c => c.cents > 0).sort((a, b) => b.cents - a.cents)
  // forecast only makes sense for the month in progress
  let forecast = null
  if (today.slice(0, 7) === ym && total > 0) {
    const [y, m] = ym.split('-').map(Number), days = new Date(Date.UTC(y, m, 0)).getUTCDate(), day = +today.slice(8, 10)
    forecast = { cents: Math.round(total / day * days), days, day }
  }
  // fronting: what you paid upfront for other people this month
  const monthExp = expenses.filter(e => monthOf(e.spent_on || e.created_at) === ym)
  const mineIds = new Set(these.map(i => i.id))
  const paidByMe = monthExp.filter(e => e.paid_by === me)
  const paidCents = paidByMe.reduce((t, e) => t + e.amount_cents, 0)
  const myShareOfPaid = these.filter(i => paidByMe.some(e => (e.id || e.$id) === i.id)).reduce((t, i) => t + i.amount_cents, 0)
  const fronted = { paid: paidCents, forOthers: paidCents - myShareOfPaid, count: paidByMe.length }
  // who pays in each group (share of the group's spending this month that you paid for)
  const groupsPay = Object.values(monthExp.reduce((a, e) => {
    const g = a[e.group_id] ||= { group_id: e.group_id, total: 0, mine: 0, count: 0 }
    g.total += e.amount_cents; g.count++; if (e.paid_by === me) g.mine += e.amount_cents
    return a
  }, {})).filter(g => g.total > 0).map(g => ({ ...g, pct: g.mine / g.total })).sort((a, b) => b.total - a.total)
  const fixed = sumCents(these.filter(i => i.recurring))
  const top = [...these].sort((a, b) => b.amount_cents - a.amount_cents).slice(0, 5)
  return { total, categories, forecast, fronted, groupsPay, fixed, oneOff: total - fixed, top, involved: mineIds.size }
}
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
