// Run with: npm test  (plain Node, no test framework)
import assert from 'node:assert'
import { allocate, computeNets, simplify, splitsFromDraft, parseReceipt, nextDate, dueDates, filterExpenses, peopleBalances, itemSplit, parseReceiptItems, guessCode, convertCents, myShares, shiftMonth, inMonth, sumCents, budgetStatus, monthInsights, daysBetween, toCents, money, localDay } from './split.js'

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

// overall balance per person across groups
const M = (...ids) => ids.map(id => ({ user_id: id, display_name: id.toUpperCase() }))
const g1 = { name: 'Roomies', currency: '$', members: M('me', 'sam'), expenses: [{ id: 'e1', paid_by: 'me', amount_cents: 8000 }],
  splits: [{ expense_id: 'e1', member_id: 'me', owed_cents: 4000 }, { expense_id: 'e1', member_id: 'sam', owed_cents: 4000 }], settlements: [] }
const g2 = { name: 'Trip', currency: '$', members: M('me', 'sam', 'maya'), expenses: [{ id: 'e2', paid_by: 'sam', amount_cents: 3000 }],
  splits: ['me', 'sam', 'maya'].map(id => ({ expense_id: 'e2', member_id: id, owed_cents: 1000 })), settlements: [] }
const g3 = { name: 'Euro', currency: '€', members: M('me', 'sam'), expenses: [{ id: 'e3', paid_by: 'sam', amount_cents: 500 }],
  splits: [{ expense_id: 'e3', member_id: 'me', owed_cents: 500 }], settlements: [{ from_member: 'me', to_member: 'sam', amount_cents: 500 }] }
const pb = peopleBalances('me', [g1, g2, g3])
assert.equal(pb.length, 1) // € group is settled, maya owes sam not me
assert.deepEqual([pb[0].user_id, pb[0].net, pb[0].cur, pb[0].groups], ['sam', 3000, '$', ['Roomies', 'Trip']]) // 40 owed - 10 owing
assert.deepEqual(pb[0].parts.map(x => [x.group.name, x.amount]), [['Roomies', 4000], ['Trip', -1000]]) // settle-all pieces sum to the net

// itemized split: pizza 20 shared a+b, beer 10 for b only, total 33 (3 tax) -> tax shared 1:2
let it = itemSplit(3300, [{ cents: 2000, people: ['a', 'b'] }, { cents: 1000, people: ['b'] }], 'a')
assert.ok(it.ok)
assert.equal(it.owed.a + it.owed.b, 3300)
assert.deepEqual(it.owed, { a: 1100, b: 2200 })
assert.equal(itemSplit(2000, [{ cents: 2500, people: ['a'] }], 'a').ok, false) // items over total
assert.equal(itemSplit(1000, [{ cents: 500, people: [] }], 'a').ok, false) // nobody assigned
// receipt lines -> items
const items = parseReceiptItems(["JOE'S DINER", '2 Burger 14.50', 'Fries 4.25', 'Subtotal 18.75', 'HST 2.44', 'TOTAL 21.19', 'VISA 21.19'].join('\n'))
assert.deepEqual(items, [{ name: 'Burger', cents: 1450 }, { name: 'Fries', cents: 425 }])

// currency
assert.equal(guessCode('€'), 'EUR'); assert.equal(guessCode('$'), 'CAD'); assert.equal(guessCode('usd'), 'USD'); assert.equal(guessCode('??'), 'CAD')
assert.equal(convertCents(5000, 1.5707), 7854) // €50 -> $78.54 (78.535 rounds up)
assert.equal(convertCents(1, 0.004), 0)

// spending = my share, not the full bill; settle-ups never count
const exps = [{ id: 'e1', description: 'Groceries', category: 'food', group_id: 'g', spent_on: '2026-11-03' },
  { id: 'e2', description: 'Rent', category: 'home', group_id: 'g', spent_on: '2026-10-01' },
  { id: 'e3', description: 'Taxi', category: 'transport', group_id: 'g', spent_on: '2026-11-20' }]
const spl = [{ expense_id: 'e1', member_id: 'me', owed_cents: 4000 }, { expense_id: 'e1', member_id: 'sam', owed_cents: 4000 },
  { expense_id: 'e2', member_id: 'me', owed_cents: 90000 }, { expense_id: 'e3', member_id: 'sam', owed_cents: 3000 }]
const mine = myShares('me', exps, spl)
assert.equal(mine.length, 2) // Taxi was all Sam's share
assert.equal(sumCents(inMonth(mine, '2026-11')), 4000) // half the $80 groceries, not $80
assert.equal(sumCents(inMonth(mine, '2026-10')), 90000)
assert.equal(shiftMonth('2026-01', -1), '2025-12'); assert.equal(shiftMonth('2026-12', 1), '2027-01')

// budget: $800 in a 30-day month
let b = budgetStatus(40000, 80000, '2026-11', '2026-11-15') // half the money, half the month
assert.deepEqual([b.pace, b.left, b.daysLeft, b.expected], ['ok', 40000, 15, 40000])
assert.equal(budgetStatus(60000, 80000, '2026-11', '2026-11-10').pace, 'ahead') // 75% spent a third of the way in
assert.equal(budgetStatus(90000, 80000, '2026-11', '2026-11-29').pace, 'over')
assert.equal(budgetStatus(70000, 80000, '2026-10', '2026-11-15').pace, 'ok') // past month: no pace, just under budget
assert.equal(budgetStatus(10000, 80000, '2026-02', '2026-02-28').daysLeft, 0)

// insights for November: I paid $80 groceries (my share 40) and $1000 rent template (share 500, repeats); Sam paid $30 taxi (my share 15)
const iexp = [
  { id: 'a', description: 'Groceries', category: 'food', group_id: 'g1', paid_by: 'me', amount_cents: 8000, spent_on: '2026-11-03' },
  { id: 'b', description: 'Rent', category: 'home', group_id: 'g1', paid_by: 'me', amount_cents: 100000, spent_on: '2026-11-01', repeat: 'monthly' },
  { id: 'c', description: 'Taxi', category: 'transport', group_id: 'g2', paid_by: 'sam', amount_cents: 3000, spent_on: '2026-11-10' },
  { id: 'd', description: 'Groceries', category: 'food', group_id: 'g1', paid_by: 'sam', amount_cents: 2000, spent_on: '2026-10-12' }]
const ispl = [{ expense_id: 'a', member_id: 'me', owed_cents: 4000 }, { expense_id: 'b', member_id: 'me', owed_cents: 50000 },
  { expense_id: 'c', member_id: 'me', owed_cents: 1500 }, { expense_id: 'd', member_id: 'me', owed_cents: 1000 }]
const ins = monthInsights({ me: 'me', ym: '2026-11', today: '2026-11-15', items: myShares('me', iexp, ispl), expenses: iexp })
assert.equal(ins.total, 55500)
assert.deepEqual(ins.categories.map(c => [c.cat, c.cents, c.delta]), [['home', 50000, 50000], ['food', 4000, 3000], ['transport', 1500, 1500]])
assert.deepEqual(ins.fronted, { paid: 108000, forOthers: 54000, count: 2 }) // paid 1080, own share 540
assert.equal(ins.forecast.cents, 111000) // 555 in 15 of 30 days -> 1110
assert.deepEqual([ins.fixed, ins.oneOff], [50000, 5500])
assert.deepEqual(ins.groupsPay.map(g => [g.group_id, Math.round(g.pct * 100)]), [['g1', 100], ['g2', 0]])
assert.equal(ins.top[0].description, 'Rent')
assert.equal(monthInsights({ me: 'me', ym: '2026-10', today: '2026-11-15', items: myShares('me', iexp, ispl), expenses: iexp }).forecast, null)
assert.equal(daysBetween('2026-10-03', '2026-11-25'), 53)
// "waiting since" on a person balance
const sinceG = { id: 'g', team_id: 't', name: 'G', currency: '$', members: M('me', 'sam'),
  expenses: [{ id: 'x', paid_by: 'me', amount_cents: 2000, spent_on: '2026-09-01' }, { id: 'y', paid_by: 'me', amount_cents: 4000, spent_on: '2026-10-03' }],
  splits: [{ expense_id: 'x', member_id: 'sam', owed_cents: 2000 }, { expense_id: 'y', member_id: 'sam', owed_cents: 4000 }],
  settlements: [{ from_member: 'sam', to_member: 'me', amount_cents: 2000, $createdAt: '2026-09-20T10:00:00Z' }] }
assert.equal(peopleBalances('me', [sinceG])[0].since, '2026-10-03') // the Sept one was paid back

// typed amounts: either decimal mark, with or without thousands separators
for (const [typed, cents] of [['12.50', 1250], ['12,50', 1250], ['1,234.50', 123450], ['1.234,50', 123450], ['1,234', 123400], ['$ 8', 800], ['', 0], ['abc', 0]]) assert.equal(toCents(typed), cents, typed)
assert.equal(money(123456789), '$1,234,567.89')
assert.equal(money(-5), '-$0.05')
assert.equal(localDay(new Date(2026, 0, 31, 23, 59)), '2026-01-31') // late evening stays on the same day

console.log('ok — all split/balance/receipt/recurring/filter/people/item/currency/spending/budget/insight checks passed')
