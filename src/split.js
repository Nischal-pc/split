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
