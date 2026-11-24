// Run with: npm test  (plain Node, no test framework)
import assert from 'node:assert'
import { allocate, computeNets, simplify, splitsFromDraft, parseReceipt, nextDate, dueDates, filterExpenses } from './split.js'

// equal split of 10.00 among 3 -> 3.34/3.33/3.33, remainder to payer
let a = allocate(1000, [{ id: 'x', w: 1 }, { id: 'y', w: 1 }, { id: 'z', w: 1 }], 'x')
assert.equal(a.x + a.y + a.z, 1000)
assert.equal(a.x, 334)

// percent split always sums exact
let p = allocate(10000, [{ id: 'a', w: 33.3 }, { id: 'b', w: 33.3 }, { id: 'c', w: 33.4 }], 'a')
assert.equal(p.a + p.b + p.c, 10000)

// exact split passes through
let e = splitsFromDraft({ amount: 900, type: 'exact', picks: ['a', 'b'], vals: { a: 600, b: 300 }, payer: 'a' })
assert.deepEqual(e, { a: 600, b: 300 })

// net math + simplify
const members = [{ user_id: 'a' }, { user_id: 'b' }, { user_id: 'c' }]
const expenses = [{ paid_by: 'a', amount_cents: 3000 }]
const splits = [{ member_id: 'a', owed_cents: 1000 }, { member_id: 'b', owed_cents: 1000 }, { member_id: 'c', owed_cents: 1000 }]
const nets = computeNets(members, expenses, splits, [])
assert.equal(nets.a, 2000); assert.equal(nets.b, -1000); assert.equal(nets.c, -1000)
const s = simplify(nets)
assert.equal(s.length, 2)
assert.equal(s.reduce((t, x) => t + x.amount, 0), 2000)

// receipt parsing: picks the TOTAL (not subtotal/items) and the merchant
const receipt = `WHOLE FOODS MARKET
123 Main St
Bananas 2.50
Milk 3.99
Subtotal 6.49
Tax 0.52
TOTAL 7.01`
const r = parseReceipt(receipt)
assert.equal(r.amount, 701)
assert.ok(/Whole Foods/.test(r.merchant), 'merchant: ' + r.merchant)

// recurring dates
assert.equal(nextDate('2026-01-31', 'monthly'), '2026-02-28')
assert.equal(nextDate('2026-12-15', 'monthly'), '2027-01-15')
assert.equal(nextDate('2026-12-29', 'weekly'), '2027-01-05')
assert.deepEqual(dueDates('2026-01-01', 'monthly', '2026-03-10'), ['2026-01-01', '2026-02-01', '2026-03-01'])
assert.deepEqual(dueDates('2026-05-01', 'weekly', '2026-04-30'), [])
assert.equal(dueDates('2000-01-01', 'weekly', '2026-01-01').length, 24)

// search + filter
const ex = [{ description: 'Pizza night', category: 'food', paid_by: 'a' }, { description: 'Uber', category: 'transport', paid_by: 'b', notes: 'airport pizza' }]
assert.equal(filterExpenses(ex, { q: 'pizza' }).length, 2)
assert.equal(filterExpenses(ex, { q: 'pizza', cat: 'food' }).length, 1)
assert.equal(filterExpenses(ex, { who: 'b' })[0].description, 'Uber')

console.log('ok — all split/balance/receipt/recurring/filter checks passed')
