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
  firstRecordDay,
  moneyBook,
  monthlyReport,
  periodReport,
  supplierLedger,
} from '../src/lib/books'
import type { Book } from '../src/lib/types'
import { tidyPayment } from '../src/data/api'
import type { Backend } from '../src/data/api'
import { createDemoBackend, memoryStore } from '../src/data/demo'
import { TABLES, toBook } from '../src/data/rows'
import { addDays, rs } from '../src/lib/format'
import { setLang } from '../src/lib/i18n'
import { uuid } from '../src/lib/ids'
import { periodAround, readPeriod, stepPeriod, writePeriod } from '../src/lib/period'
import { checkSale } from '../src/lib/rules'
import { balanceMessage, challanMessage, whatsappLink, whatsappNumber } from '../src/lib/share'
import { memoryLocal } from '../src/data/local'
import type { LocalStore } from '../src/data/local'
import { Unreachable, createSyncedBackend } from '../src/data/synced'
import type { Remote } from '../src/data/synced'
import { wire } from '../src/data/wire'
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
  await check(`${label}: the balance sheet ends on cash plus bank, and transfers change nothing`, () => {
    const sheet = moneyBook(book, 'both')
    assert.equal(r2(sheet.balance), r2(d.money.cash + d.money.bank))
    const moved = sheet.entries.filter((e) => e.moved > 0)
    assert.equal(moved.length, book.payments.filter((p) => p.account === null).length)
    for (const e of moved) assert.equal(e.inflow + e.outflow, 0)
    const movements = (account: 'cash' | 'bank' | 'both') =>
      moneyBook(book, account).entries.filter((e) => e.ref.type !== 'opening').length
    assert.equal(movements('both'), movements('cash') + movements('bank') - moved.length)
  })
  await check(`${label}: a report for any stretch of days adds up the same as its months`, () => {
    const months = monthlyReport(book, d.stats)
    const keys = ['sales', 'received', 'credit', 'costOfSold', 'deathLoss', 'expenses', 'profit', 'headSold', 'headDied', 'bought'] as const
    const pick = (r: Record<(typeof keys)[number], number>) => keys.map((k) => r2(r[k]))
    for (const m of months) {
      const p = periodAround('month', `${m.month}-01`)
      assert.deepEqual(pick(periodReport(book, d.stats, p.from, p.to)), pick(m), m.month)
    }
    const first = firstRecordDay(book)!
    const everything = periodReport(book, d.stats, first, '9999-12-31')
    assert.deepEqual(
      pick(everything),
      keys.map((k) => r2(months.reduce((t, m) => t + m[k], 0))),
    )
    assert.equal(r2(periodReport(book, d.stats, '1900-01-01', addDays(first, -1)).sales), 0)
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

/** The calendar arithmetic behind the period picker. */
async function checkPeriods(): Promise<void> {
  const span = (p: { from: string; to: string }) => `${p.from}..${p.to}`
  await check('periods: a month, quarter, half and year hold the right days', () => {
    assert.equal(span(periodAround('month', '2028-02-10')), '2028-02-01..2028-02-29')
    assert.equal(span(periodAround('month', '2026-02-10')), '2026-02-01..2026-02-28')
    assert.equal(span(periodAround('quarter', '2026-08-15')), '2026-07-01..2026-09-30')
    assert.equal(span(periodAround('quarter', '2026-12-31')), '2026-10-01..2026-12-31')
    assert.equal(span(periodAround('half', '2026-06-30')), '2026-01-01..2026-06-30')
    assert.equal(span(periodAround('half', '2026-07-01')), '2026-07-01..2026-12-31')
    assert.equal(span(periodAround('year', '2026-10-07')), '2026-01-01..2026-12-31')
  })
  await check('periods: the arrows step across a year end', () => {
    assert.equal(span(stepPeriod(periodAround('month', '2026-01-20'), -1)), '2025-12-01..2025-12-31')
    assert.equal(span(stepPeriod(periodAround('quarter', '2026-11-02'), 1)), '2027-01-01..2027-03-31')
    assert.equal(span(stepPeriod(periodAround('half', '2026-03-03'), -1)), '2025-07-01..2025-12-31')
  })
  await check('periods: the address keeps the period, and reads back the same', () => {
    const today = '2026-10-07'
    for (const p of [
      periodAround('month', today),
      periodAround('quarter', '2026-05-05'),
      periodAround('year', '2025-01-01'),
      { kind: 'custom' as const, from: '2026-08-10', to: '2026-09-20' },
    ]) {
      const params = writePeriod(new URLSearchParams('book=cash'), p, today)
      assert.equal(params.get('book'), 'cash')
      assert.deepEqual(readPeriod(params, today), p)
    }
    assert.equal(writePeriod(new URLSearchParams(), periodAround('month', today), today).toString(), '')
    assert.deepEqual(readPeriod(new URLSearchParams('period=custom&from=2026-09-20&to=2026-08-10'), today), {
      kind: 'custom',
      from: '2026-08-10',
      to: '2026-09-20',
    })
  })
}

/** The WhatsApp button: Pakistani numbers in WhatsApp's form, and a message that says which way the money is owed. */
async function checkWhatsApp(): Promise<void> {
  await check('whatsapp: Pakistani numbers become 92…, anything else is left out', () => {
    for (const n of ['0300 1234567', '0300-1234567', '+92 300 1234567', '0092 300 1234567', '3001234567', '92 300 1234567']) {
      assert.equal(whatsappNumber(n), '923001234567', n)
    }
    assert.equal(whatsappNumber(''), null)
    assert.equal(whatsappNumber('12'), null)
    assert.equal(whatsappLink(null, 'a b'), 'https://wa.me/?text=a%20b')
    assert.equal(whatsappLink('0311 1112223', 'Rs 5,000'), 'https://wa.me/923111112223?text=Rs%205%2C000')
  })
  const message = (kind: 'customer' | 'supplier', balance: number) =>
    balanceMessage({ kind, name: 'Bilal', balance, business: 'Demo Mandi', today: '2026-10-07' })
  await check('whatsapp: the message says who owes whom, and how much', () => {
    assert.equal(
      message('customer', 220_000),
      'Hello Bilal,\nYour account with Demo Mandi, as of 7 Oct 2026:\nYou owe us *Rs 220,000*.\nThank you.',
    )
    assert.match(message('supplier', 765_000), /We owe you \*Rs 765,000\*\./)
    assert.match(message('customer', -5_000), /We hold \*Rs 5,000\* of yours in advance\./)
    assert.match(message('supplier', -5_000), /You hold \*Rs 5,000\* of ours in advance\./)
    assert.match(message('customer', 0.2), /Your account is settled\. Nothing is due\./)
    assert.match(balanceMessage({ kind: 'customer', name: 'B', balance: 1, business: ' ', today: '2026-10-07' }), /^Hello B,\nYour account as of 7 Oct 2026:/)
  })
  const challan = {
    name: 'Sher Afzal',
    business: 'Demo Mandi',
    number: 3,
    boughtOn: '2026-09-29',
    animals: [
      { animal: 'Bakra', head: 25 },
      { animal: 'Dumba', head: 6 },
    ],
    total: 1_765_000,
    paidNow: 1_000_000,
    paidFrom: 'bank' as const,
    balance: 765_000,
    today: '2026-10-07',
  }
  await check("whatsapp: a challan's message gives the purchase, then the whole khata", () => {
    assert.equal(
      challanMessage(challan),
      [
        'Hello Sher Afzal,',
        'Demo Mandi: Challan #3, bought 29 Sept 2026',
        '25 Bakra · 6 Dumba',
        'Challan total: *Rs 1,765,000*',
        'Paid at purchase (Bank): Rs 1,000,000',
        'On credit: Rs 765,000',
        'Your whole account as of 7 Oct 2026: We owe you *Rs 765,000*.',
        'Thank you.',
      ].join('\n'),
    )
    assert.match(challanMessage({ ...challan, balance: 0 }), /Your account is settled\. Nothing is due\./)
  })
  await check('whatsapp: in Roman Urdu the message reads the mandi way', () => {
    setLang('ur')
    try {
      assert.match(message('customer', 220_000), /Aap ne humein \*Rs 2,20,000\* dene hain\./)
      assert.match(message('supplier', 765_000), /Hum ne aap ko \*Rs 7,65,000\* dene hain\./)
      assert.match(message('supplier', 765_000), /^Assalam-o-Alaikum Bilal,\nDemo Mandi ke saath aap ka hisaab, 7 Oct 2026 tak:/)
      assert.match(challanMessage(challan), /Demo Mandi: Challan #3, 29 Sept 2026 ko khareeda\n25 Bakra · 6 Dumba\nChallan ka kul: \*Rs 17,65,000\*/)
      assert.match(challanMessage(challan), /Khareed ke waqt diye \(Bank\): Rs 10,00,000\nUdhaar: Rs 7,65,000\n7 Oct 2026 tak aap ka pura hisaab: Hum ne aap ko \*Rs 7,65,000\* dene hain\./)
    } finally {
      setLang('en')
    }
  })
}

// --------------------------------------------------------- offline sync --

/** The phone's link to the server in the checks: it can be cut, or lose one reply after the server acted. */
type Net = { up: boolean; loseNextReply: boolean }

function pgRemote(db: PGlite, uid: string, net: Net): Remote {
  const reader = sqlBackend(db, uid)
  return {
    async pull() {
      if (!net.up) throw new Unreachable('offline')
      return reader.load()
    },
    async push(q) {
      if (!net.up) throw new Unreachable('offline')
      const rows = await as(db, uid, async () =>
        (await db.query<{ r: { status: 'ok' | 'conflict'; number?: number | null } }>('select public.apply_change($1::jsonb) as r', [
          JSON.stringify(wire(q)),
        ])).rows,
      )
      if (net.loseNextReply) {
        net.loseNextReply = false
        throw new Unreachable('the reply was lost on the way back')
      }
      const r = rows[0].r
      return r.status === 'conflict' ? { status: 'conflict' } : { status: 'ok', number: r.number ?? null }
    },
  }
}

/** Two phones of one business, A and B, each with its own copy and its own connection. */
function phone(db: PGlite, uid: string, email: string, local: LocalStore = memoryLocal(), net: Net = { up: true, loseNextReply: false }) {
  const api = createSyncedBackend({
    remote: pgRemote(db, uid, net),
    auth: {
      session: async () => ({ email }),
      onAuthChange: () => () => {},
      signIn: async () => ({ email }),
      signOut: async () => {},
    },
    local,
    isOnline: () => net.up,
    timers: false,
  })
  return { api, net, local }
}

async function checkOfflineSync(db: PGlite, demoBook: Book): Promise<void> {
  const owner = uuid()
  const email = 'sync@mandi.test'
  await addUser(db, owner, email)
  const server = sqlBackend(db, owner)
  const A = phone(db, owner, email)
  const B = phone(db, owner, email)
  const { fillSample } = await import('../src/data/sample')
  /** A sync check: both phones start online, whatever the one before left behind. */
  const step = (name: string, fn: () => Promise<unknown>) =>
    check(`sync: ${name}`, async () => {
      A.net.up = B.net.up = true
      A.net.loseNextReply = B.net.loseNextReply = false
      await fn()
    })
  const waiting = (p: ReturnType<typeof phone>) => p.api.sync.state().waiting
  const problems = (p: ReturnType<typeof phone>) => p.api.sync.state().problems

  await step('a phone keeps its changes and sends them all, in order, through the real rules', async () => {
    await A.api.load()
    await fillSample(A.api, TODAY)
    assert.ok(waiting(A) > 40, `only ${waiting(A)} waiting`)
    assert.deepEqual(figures(await A.api.load()), figures(demoBook))
    await A.api.sync.syncNow()
    assert.equal(A.api.sync.state().queue.length, 0)
    assert.deepEqual(figures(await server.load()), figures(demoBook))
    assert.deepEqual(figures(await A.api.load()), figures(demoBook))
    assert.deepEqual(figures(await B.api.load()), figures(demoBook))
  })

  // An expense from the sample, the same one each time.
  const someExpense = async () => [...(await server.load()).expenses].sort((a, b) => a.id.localeCompare(b.id))[0]
  const newExpense = (amount: number) => ({
    id: uuid(),
    spent_on: TODAY,
    category: 'Sync check',
    amount,
    paid_from: 'cash' as const,
    challan_id: null,
    notes: null,
  })

  await step('offline, a save shows at once and waits; back online, it reaches the server', async () => {
    A.net.up = false
    const e = newExpense(1_234)
    await A.api.saveExpense(e)
    assert.ok((await A.api.load()).expenses.some((x) => x.id === e.id))
    assert.equal(waiting(A), 1)
    assert.equal(A.api.sync.state().online, false)
    assert.ok(!(await server.load()).expenses.some((x) => x.id === e.id))
    await A.api.sync.syncNow()
    assert.equal(waiting(A), 1, 'nothing goes while the connection is down')
    A.net.up = true
    await A.api.sync.syncNow()
    assert.equal(waiting(A), 0)
    assert.ok((await server.load()).expenses.some((x) => x.id === e.id))
  })

  await step('a change whose reply was lost is done once, and an edit after it still lands', async () => {
    const p = { id: uuid(), paid_on: TODAY, kind: 'owner_in' as const, customer_id: null, supplier_id: null, account: 'cash' as const, amount: 5_000, notes: null }
    A.net.loseNextReply = true
    await A.api.savePayment(p)
    await A.api.sync.syncNow()
    assert.equal(waiting(A), 1, 'the phone never heard back, so it still holds the change')
    assert.equal((await server.load()).payments.filter((x) => x.id === p.id).length, 1)
    await A.api.savePayment({ ...p, amount: 6_000 })
    await A.api.sync.syncNow()
    assert.equal(A.api.sync.state().queue.length, 0)
    assert.deepEqual(problems(A), [])
    const saved = (await server.load()).payments.find((x) => x.id === p.id)!
    assert.deepEqual([r2(saved.amount), saved.version], [6_000, 2])
  })

  await step('two phones change one record; the second hears of it and can keep its own copy', async () => {
    const e = await someExpense()
    await A.api.sync.syncNow()
    await B.api.sync.syncNow()
    await B.api.saveExpense({ ...e, amount: 7_000 })
    await B.api.sync.syncNow()
    A.net.up = false
    await A.api.saveExpense({ ...e, amount: 8_000 })
    A.net.up = true
    await A.api.sync.syncNow()
    assert.equal(problems(A).length, 1)
    assert.equal(problems(A)[0].state, 'conflict')
    assert.equal(r2((await server.load()).expenses.find((x) => x.id === e.id)!.amount), 7_000, "B's copy stands meanwhile")
    await A.api.sync.keepMine(problems(A)[0].op)
    assert.deepEqual(problems(A), [])
    assert.equal(r2((await server.load()).expenses.find((x) => x.id === e.id)!.amount), 8_000)
    await B.api.sync.syncNow()
    assert.equal(r2((await B.api.load()).expenses.find((x) => x.id === e.id)!.amount), 8_000)
  })

  await step("or it can drop its change and take the other phone's", async () => {
    const e = await someExpense()
    await A.api.sync.syncNow()
    await B.api.saveExpense({ ...e, amount: 9_000 })
    await B.api.sync.syncNow()
    A.net.up = false
    await A.api.saveExpense({ ...e, amount: 1_000 })
    A.net.up = true
    await A.api.sync.syncNow()
    assert.equal(problems(A)[0]?.state, 'conflict')
    await A.api.sync.drop(problems(A)[0].op)
    assert.equal(A.api.sync.state().queue.length, 0)
    assert.equal(r2((await A.api.load()).expenses.find((x) => x.id === e.id)!.amount), 9_000)
    assert.equal(r2((await server.load()).expenses.find((x) => x.id === e.id)!.amount), 9_000)
  })

  await step('the last animal sold on two phones: the second is refused, kept with the reason, and can be dropped', async () => {
    await A.api.sync.syncNow()
    await B.api.sync.syncNow()
    const d = derive(await A.api.load())
    const line = d.challans.find((c) => c.challan.number === 2)!.lines.find((s) => s.left === 1)!
    const sell = () => ({
      id: uuid(),
      sold_on: TODAY,
      customer_id: null,
      received_now: 310_000,
      received_in: 'cash' as const,
      notes: null,
      lines: [{ id: uuid(), challan_line_id: line.line.id, head: 1, amount: 310_000, damaged: false }],
    })
    A.net.up = false
    const mine = sell()
    await A.api.saveSale(mine)
    await B.api.saveSale(sell())
    await B.api.sync.syncNow()
    A.net.up = true
    await A.api.sync.syncNow()
    assert.equal(problems(A).length, 1)
    assert.equal(problems(A)[0].state, 'failed')
    assert.match(problems(A)[0].problem ?? '', /Challan #2/)
    const after = derive(await A.api.load())
    assert.ok(!after.book.sales.some((s) => s.id === mine.id), "the refused sale is not counted in the phone's books")
    assert.equal(after.stats.get(line.line.id)!.left, 0)
    await A.api.sync.drop(problems(A)[0].op)
    assert.equal(A.api.sync.state().queue.length, 0)
  })

  await step('what depends on a refused change waits for it, and goes once it is fixed', async () => {
    await A.api.sync.syncNow()
    await B.api.saveParty('customer', { id: uuid(), name: 'Haji Rafiq', phone: null, notes: null, opening_balance: 0 })
    await B.api.sync.syncNow()
    A.net.up = false
    const rafiq = { id: uuid(), name: 'Haji Rafiq', phone: '0300 1111111', notes: null, opening_balance: 0 }
    await A.api.saveParty('customer', rafiq)
    const bakra = derive(await A.api.load()).challans.find((c) => c.challan.number === 3)!.lines.find((s) => s.left > 0)!
    const sale = {
      id: uuid(),
      sold_on: TODAY,
      customer_id: rafiq.id,
      received_now: 0,
      received_in: 'cash' as const,
      notes: null,
      lines: [{ id: uuid(), challan_line_id: bakra.line.id, head: 1, amount: 60_000, damaged: false }],
    }
    await A.api.saveSale(sale)
    A.net.up = true
    await A.api.sync.syncNow()
    assert.equal(problems(A).length, 2, 'the customer is refused and the sale waits on it')
    assert.match(problems(A).find((q) => q.entity === 'customer')!.problem ?? '', /name|already/i)
    assert.ok(!(await server.load()).sales.some((s) => s.id === sale.id), 'the sale was not sent ahead of its customer')
    await A.api.saveParty('customer', { ...rafiq, name: 'Haji Rafiq (Lahore)' })
    await A.api.sync.syncNow()
    assert.deepEqual(problems(A), [])
    const b = await server.load()
    assert.ok(b.customers.some((c) => c.name === 'Haji Rafiq (Lahore)'))
    assert.ok(b.sales.some((s) => s.id === sale.id && s.customer_id === rafiq.id))
  })

  await step('changes waiting on a phone survive the app being closed, and go when it opens online', async () => {
    const shared = memoryLocal()
    const first = phone(db, owner, email, shared)
    await first.api.load()
    first.net.up = false
    const e = newExpense(2_222)
    await first.api.saveExpense(e)
    const reopened = phone(db, owner, email, shared, { up: false, loseNextReply: false })
    const book = await reopened.api.load()
    assert.ok(book.expenses.some((x) => x.id === e.id), 'the books open offline, with the change in them')
    assert.equal(waiting(reopened), 1)
    reopened.net.up = true
    await reopened.api.sync.syncNow()
    assert.equal(waiting(reopened), 0)
    assert.ok((await server.load()).expenses.some((x) => x.id === e.id))
  })

  await step('a record made and deleted offline never reaches the server at all', async () => {
    A.net.up = false
    const e = newExpense(3_333)
    await A.api.saveExpense(e)
    await A.api.deleteExpense(e.id)
    assert.equal(A.api.sync.state().queue.length, 0)
    A.net.up = true
  })

  await step('a delete of something changed on another phone asks first, then goes if kept', async () => {
    const e = newExpense(4_444)
    await A.api.saveExpense(e)
    await A.api.sync.syncNow()
    await B.api.sync.syncNow()
    await B.api.saveExpense({ ...e, amount: 4_445 })
    await B.api.sync.syncNow()
    A.net.up = false
    await A.api.deleteExpense(e.id)
    A.net.up = true
    await A.api.sync.syncNow()
    assert.equal(problems(A)[0]?.state, 'conflict')
    await A.api.sync.keepMine(problems(A)[0].op)
    assert.ok(!(await server.load()).expenses.some((x) => x.id === e.id))
  })

  await step('the business settings change offline and reach the server', async () => {
    A.net.up = false
    const s = (await A.api.load()).settings
    await A.api.saveSettings({ business_name: 'Sync Mandi', opening_cash: s.opening_cash, opening_bank: s.opening_bank })
    A.net.up = true
    await A.api.sync.syncNow()
    assert.equal((await server.load()).settings.business_name, 'Sync Mandi')
  })

  await step('a new phone with no copy, offline, says so instead of opening empty books', async () => {
    const fresh = phone(db, owner, email, memoryLocal(), { up: false, loseNextReply: false })
    await assert.rejects(fresh.api.load(), /No internet/)
  })

  await step('after all that, both phones and the server agree', async () => {
    await A.api.sync.syncNow()
    await B.api.sync.syncNow()
    const truth = figures(await server.load())
    assert.deepEqual(figures(await A.api.load()), truth)
    assert.deepEqual(figures(await B.api.load()), truth)
  })
}

async function main() {
  // The checks read English messages; Roman Urdu has its own checks below.
  setLang('en')
  const demo = createDemoBackend(memoryStore(), { today: () => TODAY })
  const demoBook = await demo.load()
  await checkSampleFigures('demo', demoBook)
  await checkIdentities('demo', demoBook)
  await checkRomanUrdu(demoBook)
  await checkPeriods()
  await checkWhatsApp()

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

  await checkOfflineSync(db, demoBook)

  console.log(`\n${passed} checks passed${failures.length ? `, ${failures.length} failed:` : '.'}`)
  for (const f of failures) console.log(`\n  ✗ ${f}`)
  process.exit(failures.length ? 1 : 0)
}

void main()
