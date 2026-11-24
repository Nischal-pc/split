// Run with: npm test  (plain Node, no test framework)
import assert from 'node:assert'
import { allocate, computeNets, simplify, splitsFromDraft, parseReceipt } from './split.js'

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

console.log('ok — all split/balance/receipt checks passed')
