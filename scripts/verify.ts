/**
 * `npm run verify`: checks the books' arithmetic and the database rules.
 *
 * 1. Fills the demo backend with the sample books (src/data/sample.ts) and
 *    checks every total against figures worked out by hand.
 * 2. Fills a real copy of the database (supabase/setup.sql in PGlite) with
 *    the same sample and checks it gives exactly the same figures, so the
 *    demo and the live app cannot drift apart.
 * 3. Checks that both refuse the same mistakes, and that one business can
 *    never see or touch another's books.
 */
import assert from 'node:assert/strict'
import type { PGlite } from '@electric-sql/pglite'
import {
  costOf,
  customerLedger,
  derive,
  moneyBook,
  monthlyReport,
  supplierLedger,
} from '../src/lib/books'
import type { Book } from '../src/lib/types'
import { tidyPayment } from '../src/data/api'
import type { Backend } from '../src/data/api'
import { createDemoBackend, memoryStore } from '../src/data/demo'
import { TABLES, toBook } from '../src/data/rows'
import { rs } from '../src/lib/format'
import { setLang } from '../src/lib/i18n'
import { uuid } from '../src/lib/ids'
import { checkSale } from '../src/lib/rules'
import { UR } from '../src/lib/ur'
import { SETUP_SQL, addUser, as, freshDb } from './pglite'

const TODAY = '2026-10-06'
let passed = 0
const failures: string[] = []

async function check(name: string, fn: () => unknown): Promise<void> {
  try {
    await fn()
    passed++
  } catch (e) {
    failures.push(`${name}\n    ${(e as Error).message.split('\n').join('\n    ')}`)
  }
}

async function refuses(name: string, fn: () => Promise<unknown>, pattern?: RegExp): Promise<void> {
  await check(name, async () => {
    let error: Error | null = null
    try {
      await fn()
    } catch (e) {
      error = e as Error
    }
    assert.ok(error, 'was allowed, but should have been refused')
    if (pattern) assert.match(error.message, pattern)
    // VERBOSE=1 shows why each was refused, to confirm it was the rule meant.
    if (process.env.VERBOSE) console.log(`  refused  ${name}\n           ${error.message}`)
  })
}

const r2 = (n: number) => Math.round(n * 100) / 100

// ----------------------------------------------------- the SQL backend --

/** The Backend the app would get from Supabase, played against PGlite as one user. */
function sqlBackend(db: PGlite, uid: string): Backend {
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    as(db, uid, async () => (await db.query<T>(sql, params)).rows)
  const json = (v: unknown) => JSON.stringify(v)
  const remove = (table: string) => async (id: string) => {
    await q(`delete from public.${table} where id = $1`, [id])
  }
  return {
    demo: false,
    session: async () => ({ email: 'test' }),
    onAuthChange: () => () => {},
    signIn: async () => ({ email: 'test' }),
    signOut: async () => {},

    async load() {
      const settings = (await q<{ s: Record<string, unknown> }>('select row_to_json(s) as s from public.settings s'))[0]?.s
      const rows = {} as Record<(typeof TABLES)[number], Record<string, unknown>[]>
      for (const t of TABLES) {
        rows[t] = (await q<{ r: Record<string, unknown>[] }>(`select coalesce(json_agg(t), '[]'::json) as r from public.${t} t`))[0].r
      }
      return toBook(settings ?? null, rows)
    },
    async saveChallan({ lines, ...c }) {
      const [{ r }] = await q<{ r: { id: string; number: number } }>(
        'select public.save_challan($1::jsonb, $2::jsonb) as r',
        [json(c), json(lines)],
      )
      return r
    },
    deleteChallan: remove('challans'),
    async saveSale({ lines, ...s }) {
      const [{ r }] = await q<{ r: { id: string; number: number } }>(
        'select public.save_sale($1::jsonb, $2::jsonb) as r',
        [json(s), json(lines)],
      )
      return r
    },
    deleteSale: remove('sales'),
    async saveDeath(d) {
      await q(
        `insert into public.deaths (id, died_on, challan_line_id, head, cause) values ($1, $2, $3, $4, $5)
         on conflict (id) do update set died_on = excluded.died_on, challan_line_id = excluded.challan_line_id,
           head = excluded.head, cause = excluded.cause`,
        [d.id, d.died_on, d.challan_line_id, d.head, d.cause],
      )
    },
    deleteDeath: remove('deaths'),
    async savePayment(input) {
      const p = tidyPayment(input)
      await q(
        `insert into public.payments (id, paid_on, kind, customer_id, supplier_id, account, amount, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (id) do update set paid_on = excluded.paid_on, kind = excluded.kind, customer_id = excluded.customer_id,
           supplier_id = excluded.supplier_id, account = excluded.account, amount = excluded.amount, notes = excluded.notes`,
        [p.id, p.paid_on, p.kind, p.customer_id, p.supplier_id, p.account, p.amount, p.notes],
      )
    },
    deletePayment: remove('payments'),
    async saveExpense(e) {
      await q(
        `insert into public.expenses (id, spent_on, category, amount, paid_from, challan_id, notes)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (id) do update set spent_on = excluded.spent_on, category = excluded.category, amount = excluded.amount,
           paid_from = excluded.paid_from, challan_id = excluded.challan_id, notes = excluded.notes`,
        [e.id, e.spent_on, e.category, e.amount, e.paid_from, e.challan_id, e.notes],
      )
    },
    deleteExpense: remove('expenses'),
    async saveParty(kind, p) {
      await q(
        `insert into public.${kind}s (id, name, phone, notes, opening_balance) values ($1, $2, $3, $4, $5)
         on conflict (id) do update set name = excluded.name, phone = excluded.phone, notes = excluded.notes,
           opening_balance = excluded.opening_balance`,
        [p.id, p.name, p.phone, p.notes, p.opening_balance],
      )
    },
    async deleteParty(kind, id) {
      await q(`delete from public.${kind}s where id = $1`, [id])
    },
    async saveSettings(s) {
      await q(
        `insert into public.settings (business_name, opening_cash, opening_bank) values ($1, $2, $3)
         on conflict (owner_id) do update set business_name = excluded.business_name,
           opening_cash = excluded.opening_cash, opening_bank = excluded.opening_bank`,
        [s.business_name, s.opening_cash, s.opening_bank],
      )
    },
  }
}

// ------------------------------------------------------------- figures --

/** Everything the app would show, with ids replaced by numbers and names so two books can be compared. */
function figures(book: Book) {
  const d = derive(book)
  const nameOf = new Map([...book.customers, ...book.suppliers].map((p) => [p.id, p.name]))
  return {
    challans: d.challans.map((c) => ({
      number: c.challan.number,
      supplier: c.supplier?.name,
      lines: c.lines.map((l) => [l.line.animal, l.line.head, l.sold, l.soldDamaged, l.died, l.left, r2(l.each)]),
      cost: r2(c.cost),
      expenses: r2(c.expenses),
      saleValue: r2(c.saleValue),
      profit: r2(c.profit),
      deathLoss: r2(c.deathLoss),
      damagedLoss: r2(c.damagedLoss),
      stockCost: r2(c.stockCost),
      closed: c.closed,
      unpaid: r2(c.unpaid),
    })),
    sales: d.sales.map((s) => [s.sale.number, s.sale.sold_on, s.customer?.name ?? 'walk-in', r2(s.total), r2(s.credit), r2(s.profit)]),
    customers: book.customers
      .map((c) => [c.name, r2(d.balances.customers.get(c.id) ?? 0), customerLedger(book, c.id, d.stats).entries.length])
      .sort(),
    suppliers: book.suppliers
      .map((s) => [s.name, r2(d.balances.suppliers.get(s.id) ?? 0), supplierLedger(book, s.id).entries.length])
      .sort(),
    money: { cash: r2(d.money.cash), bank: r2(d.money.bank) },
    months: monthlyReport(book, d.stats).map((m) => ({
      ...m,
      sales: r2(m.sales),
      received: r2(m.received),
      credit: r2(m.credit),
      costOfSold: r2(m.costOfSold),
      damagedLoss: r2(m.damagedLoss),
      deathLoss: r2(m.deathLoss),
      expenses: r2(m.expenses),
      profit: r2(m.profit),
      bought: r2(m.bought),
    })),
    payees: book.payments.map((p) => [p.paid_on, p.kind, nameOf.get(p.customer_id ?? p.supplier_id ?? '') ?? null, r2(p.amount)]).sort(),
  }
}

/** The sample books, figured by hand from src/data/sample.ts. */
async function checkSampleFigures(label: string, book: Book): Promise<void> {
  const d = derive(book)
  const byNumber = (n: number) => d.challans.find((c) => c.challan.number === n)!
  const balanceOf = (list: 'customers' | 'suppliers', name: string) => {
    const party = book[list].find((p) => p.name === name)!
    return r2(d.balances[list].get(party.id) ?? 0)
  }

  await check(`${label}: challan #1 is sold out at Rs 92,000 profit`, () => {
    const c = byNumber(1)
    assert.deepEqual(
      [c.head, c.sold, c.soldDamaged, c.died, c.left, c.closed],
      [30, 29, 2, 1, 0, true],
    )
    assert.deepEqual(
      [c.cost, c.saleValue, c.expenses, r2(c.profit), r2(c.deathLoss), r2(c.damagedLoss), c.unpaid],
      [1_600_000, 1_745_000, 53_000, 92_000, 50_000, 52_000, 400_000],
    )
  })
  await check(`${label}: challan #2 has one cow left and Rs 94,500 profit so far`, () => {
    const c = byNumber(2)
    assert.deepEqual([c.sold, c.died, c.left, c.closed], [3, 0, 1, false])
    assert.deepEqual([c.saleValue, c.expenses, r2(c.profit), r2(c.stockCost), c.unpaid], [1_085_000, 90_500, 94_500, 300_000, 200_000])
  })
  await check(`${label}: challan #3 shows its early loss of Rs 29,000`, () => {
    const c = byNumber(3)
    assert.deepEqual([c.sold, c.died, c.left], [10, 1, 20])
    assert.deepEqual([c.saleValue, c.expenses, r2(c.profit), r2(c.stockCost), c.unpaid], [651_000, 55_000, -29_000, 1_140_000, 765_000])
  })
  await check(`${label}: customer balances`, () => {
    assert.deepEqual(
      ['Bilal Meat Shop', 'Tariq (Hayatabad)', 'Javed Khan', 'Abdul Rehman Qasai'].map((n) => balanceOf('customers', n)),
      [220_000, 98_000, 106_000, 65_000],
    )
    assert.equal(r2(d.balances.receivable), 489_000)
  })
  await check(`${label}: supplier balances`, () => {
    assert.deepEqual(
      ['Gul Muhammad (Bannu)', 'Imran Malik (Okara)', 'Sher Afzal (Kohat)'].map((n) => balanceOf('suppliers', n)),
      [0, 100_000, 765_000],
    )
    assert.equal(r2(d.balances.payable), 865_000)
  })
  await check(`${label}: cash Rs 1,019,000 and bank Rs 1,930,000`, () => {
    assert.deepEqual([r2(d.money.cash), r2(d.money.bank)], [1_019_000, 1_930_000])
  })
  await check(`${label}: the months add up to Rs 38,000 profit`, () => {
    const months = monthlyReport(book, d.stats)
    const total = (f: (m: (typeof months)[number]) => number) => r2(months.reduce((t, m) => t + f(m), 0))
    assert.equal(total((m) => m.sales), 3_481_000)
    assert.equal(total((m) => m.costOfSold + m.deathLoss), 3_125_000)
    assert.equal(total((m) => m.expenses), 318_000)
    assert.equal(total((m) => m.profit), 38_000)
    assert.equal(total((m) => m.headSold), 42)
    assert.equal(total((m) => m.headDied), 2)
    assert.equal(total((m) => m.bought), 4_565_000)
  })
}

/** Rules that hold for any books, not just the sample. */
async function checkIdentities(label: string, book: Book): Promise<void> {
  const d = derive(book)
  const sum = (xs: number[]) => r2(xs.reduce((t, x) => t + x, 0))
  await check(`${label}: monthly profit and challan profit tell the same story`, () => {
    const months = monthlyReport(book, d.stats)
    const general = sum(book.expenses.filter((e) => !e.challan_id).map((e) => e.amount))
    assert.equal(sum(months.map((m) => m.profit)), r2(sum(d.challans.map((c) => c.profit)) - general))
    assert.equal(sum(months.map((m) => m.received + m.credit)), sum(months.map((m) => m.sales)))
  })
  await check(`${label}: cash and bank match every rupee in and out`, () => {
    const s = book.settings
    const kinds = (k: string) => sum(book.payments.filter((p) => p.kind === k).map((p) => p.amount))
    const expected =
      s.opening_cash +
      s.opening_bank +
      sum(book.sales.map((x) => x.received_now)) +
      kinds('from_customer') +
      kinds('owner_in') -
      sum(book.challans.map((x) => x.paid_now)) -
      kinds('to_supplier') -
      kinds('owner_out') -
      sum(book.expenses.map((x) => x.amount))
    assert.equal(r2(d.money.cash + d.money.bank), r2(expected))
    assert.equal(r2(moneyBook(book, 'cash').balance), r2(d.money.cash))
  })
  await check(`${label}: every ledger ends on its balance`, () => {
    for (const c of book.customers) assert.equal(r2(customerLedger(book, c.id, d.stats).balance), r2(d.balances.customers.get(c.id)!))
    for (const s of book.suppliers) assert.equal(r2(supplierLedger(book, s.id).balance), r2(d.balances.suppliers.get(s.id)!))
  })
  await check(`${label}: a sold-out challan's animals cost exactly what was paid`, () => {
    for (const c of d.challans.filter((x) => x.closed)) assert.equal(r2(c.costOfGone), r2(c.cost))
  })
  await check(`${label}: no line has more out than came in`, () => {
    for (const s of d.stats.values()) assert.ok(s.left >= 0, `${s.line.animal} in #${s.challan.number} is at ${s.left}`)
  })
}

/** The same mistakes, refused by whichever backend is given. */
async function checkRefusals(label: string, api: Backend): Promise<void> {
  const book = await api.load()
  const challan = (n: number) => book.challans.find((c) => c.number === n)!
  const line = (n: number, animal: string) => book.challanLines.find((l) => l.challan_id === challan(n).id && l.animal === animal)!
  const customer = (name: string) => book.customers.find((c) => c.name === name)!.id
  const goat3 = line(3, 'Goat')
  const sale = (head: number, customerId: string | null, received: number, amount = head * 60_000) => ({
    id: uuid(),
    sold_on: TODAY,
    customer_id: customerId,
    received_now: received,
    received_in: 'cash' as const,
    notes: null,
    lines: [{ id: uuid(), challan_line_id: goat3.id, head, amount, damaged: false }],
  })
  const linesOf = (n: number) => book.challanLines.filter((l) => l.challan_id === challan(n).id)
  const challanInput = (n: number, lines: { id: string; animal: string; head: number; cost: number }[]) => ({
    id: challan(n).id,
    bought_on: challan(n).bought_on,
    supplier_id: challan(n).supplier_id,
    paid_now: challan(n).paid_now,
    paid_from: challan(n).paid_from,
    notes: null,
    lines,
  })

  await refuses(`${label}: selling 17 goats when 16 are left`, () => api.saveSale(sale(17, customer('Bilal Meat Shop'), 0)))
  await refuses(`${label}: a walk-in customer paying only part`, () => api.saveSale(sale(1, null, 10_000)), /walk-in/i)
  await refuses(`${label}: taking more than the sale total`, () => api.saveSale(sale(1, customer('Javed Khan'), 70_000)), /more than/i)
  await refuses(`${label}: 17 goats dying when 16 are left`, () =>
    api.saveDeath({ id: uuid(), died_on: TODAY, challan_line_id: goat3.id, head: 17, cause: null }),
  )
  await refuses(`${label}: cutting challan #3 to 8 goats when 9 are gone`, () =>
    api.saveChallan(challanInput(3, linesOf(3).map((l) => (l.animal === 'Goat' ? { ...l, head: 8 } : l)))),
  )
  await refuses(`${label}: taking sheep off challan #3 after selling some`, () =>
    api.saveChallan(challanInput(3, linesOf(3).filter((l) => l.animal !== 'Sheep'))),
  )
  await refuses(`${label}: deleting challan #1, which has sales`, () => api.deleteChallan(challan(1).id))
  await refuses(`${label}: deleting a customer with sales`, () => api.deleteParty('customer', customer('Bilal Meat Shop')))
  await refuses(`${label}: a second supplier with the same name`, () =>
    api.saveParty('supplier', { id: uuid(), name: ' gul muhammad (bannu) ', phone: null, notes: null, opening_balance: 0 }),
  )

  // And what must work: the last 16 goats sell, a sale is corrected, a new challan is numbered on.
  await check(`${label}: selling exactly the 16 goats left, then correcting the price`, async () => {
    const s = sale(16, customer('Bilal Meat Shop'), 0)
    const saved = await api.saveSale(s)
    assert.equal(saved.number, 13)
    await api.saveSale({ ...s, lines: s.lines.map((l) => ({ ...l, amount: 1_000_000 })) })
    const after = derive(await api.load())
    const c3 = after.challans.find((c) => c.challan.number === 3)!
    assert.equal(c3.lines.find((l) => l.line.animal === 'Goat')!.left, 0)
    assert.equal(after.saleById.get(s.id)!.total, 1_000_000)
    assert.equal(r2(after.saleById.get(s.id)!.cost), r2(costOf(goat3, 16)))
    await api.deleteSale(s.id)
    const back = derive(await api.load())
    assert.equal(back.challans.find((c) => c.challan.number === 3)!.left, 20)
  })
  await check(`${label}: a new challan takes number 4`, async () => {
    const supplier = book.suppliers[0].id
    const saved = await api.saveChallan({
      id: uuid(),
      bought_on: TODAY,
      supplier_id: supplier,
      paid_now: 0,
      paid_from: 'cash',
      notes: null,
      lines: [{ id: uuid(), animal: 'Camel', head: 2, cost: 900_000 }],
    })
    assert.equal(saved.number, 4)
    await api.deleteChallan(saved.id)
  })
}

// ------------------------------------------------------- roman urdu --

/** The figures alone, with no words, so books kept in two languages can be compared. */
function numbers(book: Book) {
  const d = derive(book)
  return {
    money: [r2(d.money.cash), r2(d.money.bank)],
    owed: [r2(d.balances.receivable), r2(d.balances.payable)],
    challans: d.challans.map((c) => [c.challan.number, c.left, r2(c.profit)]),
    months: monthlyReport(book, d.stats).map((m) => [m.month, r2(m.sales), r2(m.profit)]),
  }
}

async function checkRomanUrdu(englishBook: Book): Promise<void> {
  setLang('ur')
  try {
    const book = await createDemoBackend(memoryStore(), { today: () => TODAY }).load()
    // Goats still in hand, so the sale is refused for the walk-in rule and nothing else.
    const bakra = [...derive(book).stats.values()].find((s) => s.line.animal === 'Bakra' && s.left > 0)?.line
    const refusal = bakra
      ? checkSale(book, {
          id: uuid(),
          sold_on: TODAY,
          customer_id: null,
          received_now: 1,
          received_in: 'cash',
          notes: null,
          lines: [{ id: uuid(), challan_line_id: bakra.id, head: 1, amount: 50_000, damaged: false }],
        })
      : null
    await check('roman urdu: the sample books are written in Roman Urdu', () => {
      assert.ok(bakra, 'no Bakra on any challan')
      assert.ok(book.expenses.some((e) => e.category === 'Gari ka kiraya'))
    })
    await check('roman urdu: the same records give exactly the same figures', () =>
      assert.deepEqual(numbers(book), numbers(englishBook)),
    )
    await check('roman urdu: a mistake is explained in Roman Urdu', () =>
      assert.equal(refusal, UR['A walk-in customer must pay in full. Pick a customer to sell on credit.']),
    )
    await check('roman urdu: amounts group in lakhs', () => assert.equal(rs(1_250_000), 'Rs 12,50,000'))
  } finally {
    setLang('en')
  }
  await check('english: amounts group in thousands', () => assert.equal(rs(1_250_000), 'Rs 1,250,000'))
}

// ---------------------------------------------------------------- run --

async function main() {
  // The checks read English messages; Roman Urdu has its own checks below.
  setLang('en')
  const demo = createDemoBackend(memoryStore(), { today: () => TODAY })
  const demoBook = await demo.load()
  await checkSampleFigures('demo', demoBook)
  await checkIdentities('demo', demoBook)
  await checkRomanUrdu(demoBook)

  const db = await freshDb()
  const alice = uuid()
  const bob = uuid()
  await addUser(db, alice, 'alice@mandi.test')
  await addUser(db, bob, 'bob@mandi.test')

  await check('sql: setup.sql runs a second time without error', () => db.exec(SETUP_SQL))

  const live = sqlBackend(db, alice)
  const { fillSample } = await import('../src/data/sample')
  await check('sql: the sample books save through the real rules', () => fillSample(live, TODAY))
  const liveBook = await live.load()
  await checkSampleFigures('sql', liveBook)
  await checkIdentities('sql', liveBook)
  await check('sql and demo give exactly the same figures', () => assert.deepEqual(figures(liveBook), figures(demoBook)))

  await checkRefusals('demo', demo)
  await checkRefusals('sql', live)

  // One business never sees or touches another's.
  const other = sqlBackend(db, bob)
  await check('sql: another login sees empty books', async () => {
    const b = await other.load()
    assert.deepEqual(
      [b.customers.length, b.suppliers.length, b.challans.length, b.sales.length, b.payments.length, b.expenses.length],
      [0, 0, 0, 0, 0, 0],
    )
    assert.equal(b.settings.business_name, 'My Mandi')
  })
  await refuses("sql: another login selling from this business's challan", async () => {
    const goat = liveBook.challanLines.find((l) => l.animal === 'Goat')!
    await other.saveSale({
      id: uuid(),
      sold_on: TODAY,
      customer_id: null,
      received_now: 1,
      received_in: 'cash',
      notes: null,
      lines: [{ id: uuid(), challan_line_id: goat.id, head: 1, amount: 1, damaged: false }],
    })
  })
  await refuses("sql: another login overwriting this business's customer", async () => {
    const c = liveBook.customers[0]
    await other.saveParty('customer', { ...c, name: 'Taken over' })
  })
  await check("sql: another login's delete leaves this business's sale alone", async () => {
    await other.deleteSale(liveBook.sales[0].id)
    assert.equal((await live.load()).sales.length, liveBook.sales.length)
  })
  await refuses('sql: signed-out visitors cannot save a challan', () =>
    as(db, null, () => db.query("select public.save_challan('{}'::jsonb, '[]'::jsonb)"), 'anon'),
  )
  await check('sql: signed-out visitors read nothing', async () => {
    const rows = await as(db, null, async () => (await db.query('select * from public.sales')).rows, 'anon')
    assert.equal(rows.length, 0)
  })
  await refuses('sql: a transfer that names an account', () =>
    as(db, alice, () =>
      db.query("insert into public.payments (paid_on, kind, account, amount) values ('2026-10-06', 'cash_to_bank', 'cash', 5)"),
    ),
  )

  console.log(`\n${passed} checks passed${failures.length ? `, ${failures.length} failed:` : '.'}`)
  for (const f of failures) console.log(`\n  ✗ ${f}`)
  process.exit(failures.length ? 1 : 0)
}

void main()
