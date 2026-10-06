/**
 * Every figure the app shows is worked out here from the raw records in a
 * Book. Nothing calculated is ever stored, so a correction to any record
 * (a sale's price, a death entered on the wrong challan) fixes every report
 * at once.
 *
 * Animals are counted, not tracked one by one. An animal's cost is its
 * line's average: 20 goats bought for Rs 10 lakh cost Rs 50,000 each. That
 * cost leaves the books when the animal is sold or dies.
 */
import type {
  Account,
  Book,
  Challan,
  ChallanLine,
  Expense,
  Party,
  Payment,
  Sale,
  SaleLine,
} from './types'
import { accountName } from './format'
import { t } from './i18n'

/** What a number of animals from one line cost: the line's cost spread evenly over its head. */
export function costOf(line: ChallanLine, head: number): number {
  return line.head > 0 ? (line.cost * head) / line.head : 0
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const key = keyOf(row)
    const list = map.get(key)
    if (list) list.push(row)
    else map.set(key, [row])
  }
  return map
}

function sumOf<T>(rows: T[], valueOf: (row: T) => number): number {
  let total = 0
  for (const row of rows) total += valueOf(row)
  return total
}

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position

// ------------------------------------------------------------ lines --

export type LineStats = {
  line: ChallanLine
  challan: Challan
  sold: number
  /** Of `sold`, how many went cheap because they were injured or sick. */
  soldDamaged: number
  died: number
  left: number
  /** Cost of one animal. */
  each: number
  saleValue: number
  costOfSold: number
  /** What the animals that died had cost. */
  deathLoss: number
  /** How far below cost the damaged animals sold. */
  damagedLoss: number
  /** What the animals still in hand cost. */
  stockCost: number
}

export function lineStats(book: Book): Map<string, LineStats> {
  const challans = new Map(book.challans.map((c) => [c.id, c]))
  const stats = new Map<string, LineStats>()
  for (const line of book.challanLines) {
    const challan = challans.get(line.challan_id)
    if (!challan) continue
    stats.set(line.id, {
      line,
      challan,
      sold: 0,
      soldDamaged: 0,
      died: 0,
      left: line.head,
      each: costOf(line, 1),
      saleValue: 0,
      costOfSold: 0,
      deathLoss: 0,
      damagedLoss: 0,
      stockCost: line.cost,
    })
  }
  for (const sl of book.saleLines) {
    const s = stats.get(sl.challan_line_id)
    if (!s) continue
    const cost = costOf(s.line, sl.head)
    s.sold += sl.head
    s.saleValue += sl.amount
    s.costOfSold += cost
    if (sl.damaged) {
      s.soldDamaged += sl.head
      s.damagedLoss += Math.max(0, cost - sl.amount)
    }
  }
  for (const d of book.deaths) {
    const s = stats.get(d.challan_line_id)
    if (!s) continue
    s.died += d.head
    s.deathLoss += costOf(s.line, d.head)
  }
  for (const s of stats.values()) {
    s.left = s.line.head - s.sold - s.died
    s.stockCost = costOf(s.line, s.left)
  }
  return stats
}

// --------------------------------------------------------- challans --

export type ChallanSummary = {
  challan: Challan
  supplier: Party | undefined
  lines: LineStats[]
  head: number
  sold: number
  soldDamaged: number
  died: number
  left: number
  cost: number
  /** Expenses linked to this challan: its transport, fodder and the like. */
  expenses: number
  saleValue: number
  /** Cost of the animals sold or dead so far. */
  costOfGone: number
  deathLoss: number
  damagedLoss: number
  stockCost: number
  /**
   * Sales, less the cost of the animals gone and every linked expense. Final
   * once the challan is closed; until then it is the profit so far.
   */
  profit: number
  /** Every animal is sold or dead. */
  closed: boolean
  /** What was left owing to the supplier at the time of purchase. */
  unpaid: number
}

export function challanSummaries(book: Book, stats: Map<string, LineStats>): ChallanSummary[] {
  const suppliers = new Map(book.suppliers.map((s) => [s.id, s]))
  const linesByChallan = groupBy([...stats.values()], (s) => s.challan.id)
  const expenses = new Map<string, number>()
  for (const e of book.expenses) {
    if (e.challan_id) expenses.set(e.challan_id, (expenses.get(e.challan_id) ?? 0) + e.amount)
  }

  return book.challans
    .map((challan) => {
      const lines = (linesByChallan.get(challan.id) ?? []).sort((a, b) => byPosition(a.line, b.line))
      const sum = (f: (s: LineStats) => number) => sumOf(lines, f)
      const cost = sum((s) => s.line.cost)
      const linked = expenses.get(challan.id) ?? 0
      const saleValue = sum((s) => s.saleValue)
      const costOfGone = sum((s) => s.costOfSold + s.deathLoss)
      const left = sum((s) => s.left)
      return {
        challan,
        supplier: suppliers.get(challan.supplier_id),
        lines,
        head: sum((s) => s.line.head),
        sold: sum((s) => s.sold),
        soldDamaged: sum((s) => s.soldDamaged),
        died: sum((s) => s.died),
        left,
        cost,
        expenses: linked,
        saleValue,
        costOfGone,
        deathLoss: sum((s) => s.deathLoss),
        damagedLoss: sum((s) => s.damagedLoss),
        stockCost: sum((s) => s.stockCost),
        profit: saleValue - costOfGone - linked,
        closed: lines.length > 0 && left === 0,
        unpaid: cost - challan.paid_now,
      }
    })
    .sort((a, b) => b.challan.number - a.challan.number)
}

// ------------------------------------------------------------ sales --

export type SaleView = {
  sale: Sale
  customer: Party | undefined
  lines: { line: SaleLine; stats: LineStats | undefined }[]
  head: number
  total: number
  /** Left owing at the time of sale. */
  credit: number
  cost: number
  profit: number
  damaged: boolean
}

export function saleTotals(book: Book): Map<string, number> {
  const totals = new Map<string, number>()
  for (const l of book.saleLines) totals.set(l.sale_id, (totals.get(l.sale_id) ?? 0) + l.amount)
  return totals
}

export function saleViews(book: Book, stats: Map<string, LineStats>): SaleView[] {
  const customers = new Map(book.customers.map((c) => [c.id, c]))
  const linesBySale = groupBy(book.saleLines, (l) => l.sale_id)
  return book.sales
    .map((sale) => {
      const lines = (linesBySale.get(sale.id) ?? [])
        .sort(byPosition)
        .map((line) => ({ line, stats: stats.get(line.challan_line_id) }))
      const total = sumOf(lines, (l) => l.line.amount)
      const cost = sumOf(lines, (l) => (l.stats ? costOf(l.stats.line, l.line.head) : 0))
      return {
        sale,
        customer: sale.customer_id ? customers.get(sale.customer_id) : undefined,
        lines,
        head: sumOf(lines, (l) => l.line.head),
        total,
        credit: total - sale.received_now,
        cost,
        profit: total - cost,
        damaged: lines.some((l) => l.line.damaged),
      }
    })
    .sort((a, b) =>
      a.sale.sold_on === b.sale.sold_on
        ? b.sale.number - a.sale.number
        : b.sale.sold_on.localeCompare(a.sale.sold_on),
    )
}

/** "3 Goat, 1 Sheep" for the animals on a sale. */
export function saleAnimals(view: SaleView): string {
  return view.lines.map((l) => `${l.line.head} ${l.stats?.line.animal ?? t('animals')}`).join(', ')
}

// ---------------------------------------------------------- ledgers --

export type LedgerEntry = {
  key: string
  /** Null for the opening balance, which comes before everything. */
  date: string | null
  kind: 'opening' | 'sale' | 'challan' | 'payment'
  refId: string | null
  label: string
  detail: string
  /** Adds to what is owed: a sale to the customer, a challan from the supplier. */
  charge: number
  /** Takes away from it: money paid. */
  paid: number
  /** Owed after this entry. */
  balance: number
}

type Draft = Omit<LedgerEntry, 'balance'> & { order: string }

function runBalance(drafts: Draft[]): { entries: LedgerEntry[]; balance: number } {
  drafts.sort((a, b) => {
    if (a.date === null || b.date === null) return a.date === null ? -1 : 1
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.order.localeCompare(b.order)
  })
  let balance = 0
  const entries = drafts.map(({ order: _order, ...d }) => {
    balance += d.charge - d.paid
    return { ...d, balance }
  })
  return { entries, balance }
}

function openingDraft(party: Party): Draft[] {
  const ob = party.opening_balance
  if (!ob) return []
  return [
    {
      key: 'opening',
      date: null,
      kind: 'opening',
      refId: null,
      label: t('Opening balance'),
      detail: t('Owed before the app'),
      charge: Math.max(ob, 0),
      paid: Math.max(-ob, 0),
      order: '',
    },
  ]
}

function challanCosts(book: Book): Map<string, number> {
  const costs = new Map<string, number>()
  for (const l of book.challanLines) costs.set(l.challan_id, (costs.get(l.challan_id) ?? 0) + l.cost)
  return costs
}

function paymentDetail(p: Payment): string {
  const where = accountName(p.account ?? 'cash')
  return p.notes ? `${where} · ${p.notes}` : where
}

export function customerLedger(
  book: Book,
  customerId: string,
  stats: Map<string, LineStats>,
): { entries: LedgerEntry[]; balance: number } {
  const customer = book.customers.find((c) => c.id === customerId)
  if (!customer) return { entries: [], balance: 0 }
  const drafts: Draft[] = openingDraft(customer)
  for (const view of saleViews(book, stats)) {
    if (view.sale.customer_id !== customerId) continue
    drafts.push({
      key: `sale:${view.sale.id}`,
      date: view.sale.sold_on,
      kind: 'sale',
      refId: view.sale.id,
      label: t('Sale #{n}', { n: view.sale.number }),
      detail: saleAnimals(view),
      charge: view.total,
      paid: view.sale.received_now,
      order: view.sale.created_at,
    })
  }
  for (const p of book.payments) {
    if (p.kind !== 'from_customer' || p.customer_id !== customerId) continue
    drafts.push({
      key: `payment:${p.id}`,
      date: p.paid_on,
      kind: 'payment',
      refId: p.id,
      label: t('Payment received'),
      detail: paymentDetail(p),
      charge: 0,
      paid: p.amount,
      order: p.created_at,
    })
  }
  return runBalance(drafts)
}

export function supplierLedger(book: Book, supplierId: string): { entries: LedgerEntry[]; balance: number } {
  const supplier = book.suppliers.find((s) => s.id === supplierId)
  if (!supplier) return { entries: [], balance: 0 }
  const costs = challanCosts(book)
  const linesByChallan = groupBy(book.challanLines, (l) => l.challan_id)
  const drafts: Draft[] = openingDraft(supplier)
  for (const c of book.challans) {
    if (c.supplier_id !== supplierId) continue
    const lines = (linesByChallan.get(c.id) ?? []).sort(byPosition)
    drafts.push({
      key: `challan:${c.id}`,
      date: c.bought_on,
      kind: 'challan',
      refId: c.id,
      label: t('Challan #{n}', { n: c.number }),
      detail: lines.map((l) => `${l.head} ${l.animal}`).join(', '),
      charge: costs.get(c.id) ?? 0,
      paid: c.paid_now,
      order: c.created_at,
    })
  }
  for (const p of book.payments) {
    if (p.kind !== 'to_supplier' || p.supplier_id !== supplierId) continue
    drafts.push({
      key: `payment:${p.id}`,
      date: p.paid_on,
      kind: 'payment',
      refId: p.id,
      label: t('Payment made'),
      detail: paymentDetail(p),
      charge: 0,
      paid: p.amount,
      order: p.created_at,
    })
  }
  return runBalance(drafts)
}

export type Balances = {
  /** What each customer owes you. Negative is an advance they paid. */
  customers: Map<string, number>
  /** What you owe each supplier. Negative is an advance you paid. */
  suppliers: Map<string, number>
  receivable: number
  payable: number
}

export function partyBalances(book: Book): Balances {
  const customers = new Map(book.customers.map((c) => [c.id, c.opening_balance]))
  const suppliers = new Map(book.suppliers.map((s) => [s.id, s.opening_balance]))
  const totals = saleTotals(book)
  for (const s of book.sales) {
    if (!s.customer_id || !customers.has(s.customer_id)) continue
    customers.set(s.customer_id, customers.get(s.customer_id)! + (totals.get(s.id) ?? 0) - s.received_now)
  }
  const costs = challanCosts(book)
  for (const c of book.challans) {
    if (!suppliers.has(c.supplier_id)) continue
    suppliers.set(c.supplier_id, suppliers.get(c.supplier_id)! + (costs.get(c.id) ?? 0) - c.paid_now)
  }
  for (const p of book.payments) {
    if (p.kind === 'from_customer' && p.customer_id && customers.has(p.customer_id)) {
      customers.set(p.customer_id, customers.get(p.customer_id)! - p.amount)
    }
    if (p.kind === 'to_supplier' && p.supplier_id && suppliers.has(p.supplier_id)) {
      suppliers.set(p.supplier_id, suppliers.get(p.supplier_id)! - p.amount)
    }
  }
  const positive = (m: Map<string, number>) => sumOf([...m.values()], (v) => (v > 0.005 ? v : 0))
  return { customers, suppliers, receivable: positive(customers), payable: positive(suppliers) }
}

// ---------------------------------------------------- cash and bank --

export type MoneyEntry = {
  key: string
  date: string | null
  label: string
  detail: string
  ref: { type: 'opening' | 'sale' | 'challan' | 'payment' | 'expense'; id: string | null }
  inflow: number
  outflow: number
  balance: number
}

export function paymentLabel(kind: Payment['kind']): string {
  switch (kind) {
    case 'from_customer':
      return t('Received from customer')
    case 'to_supplier':
      return t('Paid to supplier')
    case 'cash_to_bank':
      return t('Cash put in the bank')
    case 'bank_to_cash':
      return t('Cash taken from the bank')
    case 'owner_in':
      return t('Owner put money in')
    case 'owner_out':
      return t('Owner took money out')
  }
}

/** Which way a payment moves money in one account: +1 in, -1 out, 0 untouched. */
export function paymentDirection(p: Payment, account: Account): number {
  switch (p.kind) {
    case 'cash_to_bank':
      return account === 'bank' ? 1 : -1
    case 'bank_to_cash':
      return account === 'cash' ? 1 : -1
    case 'from_customer':
    case 'owner_in':
      return p.account === account ? 1 : 0
    case 'to_supplier':
    case 'owner_out':
      return p.account === account ? -1 : 0
  }
}

export function moneyBook(book: Book, account: Account): { entries: MoneyEntry[]; balance: number } {
  const customers = new Map(book.customers.map((c) => [c.id, c.name]))
  const suppliers = new Map(book.suppliers.map((s) => [s.id, s.name]))
  const challanNumbers = new Map(book.challans.map((c) => [c.id, c.number]))
  type Row = Omit<MoneyEntry, 'balance'> & { order: string }
  const rows: Row[] = []
  const opening = account === 'cash' ? book.settings.opening_cash : book.settings.opening_bank
  if (opening) {
    rows.push({
      key: 'opening',
      date: null,
      label: t('Opening balance'),
      detail: t('When you started using the app'),
      ref: { type: 'opening', id: null },
      inflow: Math.max(opening, 0),
      outflow: Math.max(-opening, 0),
      order: '',
    })
  }
  for (const s of book.sales) {
    if (s.received_in !== account || s.received_now <= 0) continue
    rows.push({
      key: `sale:${s.id}`,
      date: s.sold_on,
      label: t('Sale #{n}', { n: s.number }),
      detail: s.customer_id ? (customers.get(s.customer_id) ?? t('Customer')) : t('Walk-in customer'),
      ref: { type: 'sale', id: s.id },
      inflow: s.received_now,
      outflow: 0,
      order: s.created_at,
    })
  }
  for (const c of book.challans) {
    if (c.paid_from !== account || c.paid_now <= 0) continue
    rows.push({
      key: `challan:${c.id}`,
      date: c.bought_on,
      label: t('Challan #{n}', { n: c.number }),
      detail: suppliers.get(c.supplier_id) ?? t('Supplier'),
      ref: { type: 'challan', id: c.id },
      inflow: 0,
      outflow: c.paid_now,
      order: c.created_at,
    })
  }
  for (const p of book.payments) {
    const dir = paymentDirection(p, account)
    if (!dir) continue
    const who =
      p.kind === 'from_customer'
        ? customers.get(p.customer_id ?? '')
        : p.kind === 'to_supplier'
          ? suppliers.get(p.supplier_id ?? '')
          : undefined
    rows.push({
      key: `payment:${p.id}`,
      date: p.paid_on,
      label: paymentLabel(p.kind),
      detail: [who, p.notes].filter(Boolean).join(' · '),
      ref: { type: 'payment', id: p.id },
      inflow: dir > 0 ? p.amount : 0,
      outflow: dir < 0 ? p.amount : 0,
      order: p.created_at,
    })
  }
  for (const e of book.expenses) {
    if (e.paid_from !== account) continue
    const challan = e.challan_id ? challanNumbers.get(e.challan_id) : undefined
    rows.push({
      key: `expense:${e.id}`,
      date: e.spent_on,
      label: e.category,
      detail: [challan ? t('Challan #{n}', { n: challan }) : null, e.notes].filter(Boolean).join(' · '),
      ref: { type: 'expense', id: e.id },
      inflow: 0,
      outflow: e.amount,
      order: e.created_at,
    })
  }
  rows.sort((a, b) => {
    if (a.date === null || b.date === null) return a.date === null ? -1 : 1
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.order.localeCompare(b.order)
  })
  let balance = 0
  const entries = rows.map(({ order: _order, ...r }) => {
    balance += r.inflow - r.outflow
    return { ...r, balance }
  })
  return { entries, balance }
}

export function moneyBalances(book: Book): { cash: number; bank: number } {
  return { cash: moneyBook(book, 'cash').balance, bank: moneyBook(book, 'bank').balance }
}

// ----------------------------------------------------------- months --

export type MonthRow = {
  /** `YYYY-MM` */
  month: string
  sales: number
  /** Of `sales`, received at the time of sale. */
  received: number
  /** Of `sales`, left on credit at the time of sale. */
  credit: number
  headSold: number
  costOfSold: number
  headDamaged: number
  /** Already inside sales less cost; shown so the damage can be seen. */
  damagedLoss: number
  headDied: number
  deathLoss: number
  expenses: number
  byCategory: { category: string; amount: number }[]
  /** Sales, less the cost of animals sold, the cost of animals that died, and expenses. */
  profit: number
  /** For reference only: purchases count against profit when the animals are sold. */
  headBought: number
  bought: number
}

function blankMonth(month: string): MonthRow {
  return {
    month,
    sales: 0,
    received: 0,
    credit: 0,
    headSold: 0,
    costOfSold: 0,
    headDamaged: 0,
    damagedLoss: 0,
    headDied: 0,
    deathLoss: 0,
    expenses: 0,
    byCategory: [],
    profit: 0,
    headBought: 0,
    bought: 0,
  }
}

export function monthlyReport(book: Book, stats: Map<string, LineStats>): MonthRow[] {
  const months = new Map<string, MonthRow>()
  const at = (date: string) => {
    const key = date.slice(0, 7)
    let row = months.get(key)
    if (!row) months.set(key, (row = blankMonth(key)))
    return row
  }
  const categories = new Map<string, Map<string, number>>()

  const sales = new Map(book.sales.map((s) => [s.id, s]))
  for (const l of book.saleLines) {
    const sale = sales.get(l.sale_id)
    const s = stats.get(l.challan_line_id)
    if (!sale || !s) continue
    const row = at(sale.sold_on)
    const cost = costOf(s.line, l.head)
    row.sales += l.amount
    row.headSold += l.head
    row.costOfSold += cost
    if (l.damaged) {
      row.headDamaged += l.head
      row.damagedLoss += Math.max(0, cost - l.amount)
    }
  }
  const totals = saleTotals(book)
  for (const sale of book.sales) {
    const row = at(sale.sold_on)
    row.received += sale.received_now
    row.credit += (totals.get(sale.id) ?? 0) - sale.received_now
  }
  for (const d of book.deaths) {
    const s = stats.get(d.challan_line_id)
    if (!s) continue
    const row = at(d.died_on)
    row.headDied += d.head
    row.deathLoss += costOf(s.line, d.head)
  }
  for (const e of book.expenses) {
    const row = at(e.spent_on)
    row.expenses += e.amount
    const cats = categories.get(row.month) ?? new Map<string, number>()
    cats.set(e.category, (cats.get(e.category) ?? 0) + e.amount)
    categories.set(row.month, cats)
  }
  const boughtOn = new Map(book.challans.map((c) => [c.id, c.bought_on]))
  for (const l of book.challanLines) {
    const date = boughtOn.get(l.challan_id)
    if (!date) continue
    const row = at(date)
    row.headBought += l.head
    row.bought += l.cost
  }

  for (const row of months.values()) {
    row.profit = row.sales - row.costOfSold - row.deathLoss - row.expenses
    row.byCategory = [...(categories.get(row.month) ?? new Map<string, number>())]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month))
}

// --------------------------------------------------------- overview --

export type Derived = {
  book: Book
  stats: Map<string, LineStats>
  challans: ChallanSummary[]
  challanById: Map<string, ChallanSummary>
  sales: SaleView[]
  saleById: Map<string, SaleView>
  balances: Balances
  money: { cash: number; bank: number }
}

/** The figures most pages need, worked out once per load of the book. */
export function derive(book: Book): Derived {
  const stats = lineStats(book)
  const challans = challanSummaries(book, stats)
  const sales = saleViews(book, stats)
  return {
    book,
    stats,
    challans,
    challanById: new Map(challans.map((c) => [c.challan.id, c])),
    sales,
    saleById: new Map(sales.map((s) => [s.sale.id, s])),
    balances: partyBalances(book),
    money: moneyBalances(book),
  }
}

/** Expense categories offered as suggestions, then whatever the business has used. */
export function expenseCategories(expenses: Expense[]): string[] {
  const seen = new Map<string, string>()
  const suggested = [
    t('Transport'),
    t('Fodder'),
    t('Vet & medicine'),
    t('Labour'),
    t('Mandi fee'),
    t('Rent'),
    t('Wages'),
    t('Electricity'),
  ]
  for (const c of suggested) seen.set(c.toLowerCase(), c)
  for (const e of expenses) if (!seen.has(e.category.toLowerCase())) seen.set(e.category.toLowerCase(), e.category)
  return [...seen.values()]
}

/** Kinds of animal offered as suggestions, then whatever the business has bought. */
export function animalKinds(lines: ChallanLine[]): string[] {
  const seen = new Map<string, string>()
  const suggested = [t('Goat'), t('Sheep'), t('Cow'), t('Bull'), t('Buffalo'), t('Calf'), t('Camel')]
  for (const a of suggested) seen.set(a.toLowerCase(), a)
  for (const l of lines) if (!seen.has(l.animal.toLowerCase())) seen.set(l.animal.toLowerCase(), l.animal)
  return [...seen.values()]
}
