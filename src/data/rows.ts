/**
 * Rows as they come back from Postgres, made into the app's types. Amounts
 * are numeric columns, which can arrive as strings; owner_id is dropped.
 */
import { DEFAULT_SETTINGS } from '../lib/types'
import type {
  Book,
  Challan,
  ChallanLine,
  Death,
  Expense,
  Party,
  Payment,
  Sale,
  SaleLine,
  Settings,
} from '../lib/types'

type Raw = Record<string, unknown>

const n = (v: unknown) => Number(v ?? 0)
const s = (v: unknown) => (v === null || v === undefined ? null : String(v))
const date = (v: unknown) => String(v).slice(0, 10)
/** The server's version of a record and the change that last wrote it, when the columns are there. */
const synced = (r: Raw) =>
  r.version === undefined || r.version === null ? {} : { version: n(r.version), last_op: s(r.last_op) }

export function toSettings(r: Raw | null): Settings {
  if (!r) return { ...DEFAULT_SETTINGS }
  return {
    business_name: String(r.business_name),
    opening_cash: n(r.opening_cash),
    opening_bank: n(r.opening_bank),
    ...synced(r),
  }
}

export function toParty(r: Raw): Party {
  return {
    id: String(r.id),
    name: String(r.name),
    phone: s(r.phone),
    notes: s(r.notes),
    opening_balance: n(r.opening_balance),
    created_at: String(r.created_at),
    ...synced(r),
  }
}

export function toChallan(r: Raw): Challan {
  return {
    id: String(r.id),
    number: n(r.number),
    bought_on: date(r.bought_on),
    supplier_id: String(r.supplier_id),
    paid_now: n(r.paid_now),
    paid_from: r.paid_from === 'bank' ? 'bank' : 'cash',
    notes: s(r.notes),
    created_at: String(r.created_at),
    ...synced(r),
  }
}

export function toChallanLine(r: Raw): ChallanLine {
  return {
    id: String(r.id),
    challan_id: String(r.challan_id),
    animal: String(r.animal),
    head: n(r.head),
    cost: n(r.cost),
    position: n(r.position),
  }
}

export function toSale(r: Raw): Sale {
  return {
    id: String(r.id),
    number: n(r.number),
    sold_on: date(r.sold_on),
    customer_id: s(r.customer_id),
    received_now: n(r.received_now),
    received_in: r.received_in === 'bank' ? 'bank' : 'cash',
    notes: s(r.notes),
    created_at: String(r.created_at),
    ...synced(r),
  }
}

export function toSaleLine(r: Raw): SaleLine {
  return {
    id: String(r.id),
    sale_id: String(r.sale_id),
    challan_line_id: String(r.challan_line_id),
    head: n(r.head),
    amount: n(r.amount),
    damaged: r.damaged === true,
    position: n(r.position),
  }
}

export function toDeath(r: Raw): Death {
  return {
    id: String(r.id),
    died_on: date(r.died_on),
    challan_line_id: String(r.challan_line_id),
    head: n(r.head),
    cause: s(r.cause),
    created_at: String(r.created_at),
    ...synced(r),
  }
}

export function toPayment(r: Raw): Payment {
  return {
    id: String(r.id),
    paid_on: date(r.paid_on),
    kind: r.kind as Payment['kind'],
    customer_id: s(r.customer_id),
    supplier_id: s(r.supplier_id),
    account: r.account === 'bank' ? 'bank' : r.account === 'cash' ? 'cash' : null,
    amount: n(r.amount),
    notes: s(r.notes),
    created_at: String(r.created_at),
    ...synced(r),
  }
}

export function toExpense(r: Raw): Expense {
  return {
    id: String(r.id),
    spent_on: date(r.spent_on),
    category: String(r.category),
    amount: n(r.amount),
    paid_from: r.paid_from === 'bank' ? 'bank' : 'cash',
    challan_id: s(r.challan_id),
    notes: s(r.notes),
    created_at: String(r.created_at),
    ...synced(r),
  }
}

/** The tables a Book is read from, in the order load() fetches them. */
export const TABLES = [
  'customers',
  'suppliers',
  'challans',
  'challan_lines',
  'sales',
  'sale_lines',
  'deaths',
  'payments',
  'expenses',
] as const

export function toBook(settings: Raw | null, rows: Record<(typeof TABLES)[number], Raw[]>): Book {
  return {
    settings: toSettings(settings),
    customers: rows.customers.map(toParty),
    suppliers: rows.suppliers.map(toParty),
    challans: rows.challans.map(toChallan),
    challanLines: rows.challan_lines.map(toChallanLine),
    sales: rows.sales.map(toSale),
    saleLines: rows.sale_lines.map(toSaleLine),
    deaths: rows.deaths.map(toDeath),
    payments: rows.payments.map(toPayment),
    expenses: rows.expenses.map(toExpense),
  }
}
