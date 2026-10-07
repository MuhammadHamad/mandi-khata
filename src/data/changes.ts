/**
 * One change to the books, as data: what is saved or deleted. The demo applies
 * changes straight to its copy; the live app applies them to the copy on the
 * phone at once and queues them for the server (synced.ts). Either way they
 * pass the same rules the database enforces (src/lib/rules.ts, setup.sql).
 */
import {
  checkChallan,
  checkDeath,
  checkExpense,
  checkParty,
  checkPayment,
  checkSale,
  whyCantDeleteChallan,
  whyCantDeleteParty,
} from '../lib/rules'
import { t } from '../lib/i18n'
import type {
  Book,
  Challan,
  ChallanInput,
  ChallanLine,
  DeathInput,
  ExpenseInput,
  Party,
  PartyInput,
  PartyKind,
  PaymentInput,
  Sale,
  SaleInput,
  SaleLine,
  Settings,
} from '../lib/types'
import { clean, tidyPayment } from './api'

export type Entity = 'challan' | 'sale' | 'death' | 'payment' | 'expense' | 'customer' | 'supplier' | 'settings'

export type Change =
  | { entity: 'challan'; action: 'save'; id: string; data: ChallanInput }
  | { entity: 'sale'; action: 'save'; id: string; data: SaleInput }
  | { entity: 'death'; action: 'save'; id: string; data: DeathInput }
  | { entity: 'payment'; action: 'save'; id: string; data: PaymentInput }
  | { entity: 'expense'; action: 'save'; id: string; data: ExpenseInput }
  | { entity: PartyKind; action: 'save'; id: string; data: PartyInput }
  | { entity: 'settings'; action: 'save'; id: 'settings'; data: Settings }
  | { entity: Exclude<Entity, 'settings'>; action: 'delete'; id: string }

/** "sale:…": one key per record, whatever is done to it. */
export const recordKey = (c: { entity: Entity; id: string }) => `${c.entity}:${c.id}`

function fail(message: string | null): void {
  if (message) throw new Error(message)
}

function upsert<T extends { id: string }>(rows: T[], row: T): T[] {
  return rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row]
}

const nextNumber = (rows: { number: number }[]) => rows.reduce((max, r) => Math.max(max, r.number), 0) + 1

/**
 * The books with one change made, or an Error saying (in words staff can act on)
 * why the rules refuse it. A new challan or sale takes the next number in this
 * copy; the server may give it another if a second phone used that number first.
 * Deleting what is already gone changes nothing.
 */
export function applyChange(book: Book, change: Change, stamp: () => string): { book: Book; number?: number } {
  const b = book
  if (change.action === 'delete') {
    const id = change.id
    switch (change.entity) {
      case 'challan':
        fail(whyCantDeleteChallan(b, id))
        return {
          book: { ...b, challans: b.challans.filter((c) => c.id !== id), challanLines: b.challanLines.filter((l) => l.challan_id !== id) },
        }
      case 'sale':
        return { book: { ...b, sales: b.sales.filter((s) => s.id !== id), saleLines: b.saleLines.filter((l) => l.sale_id !== id) } }
      case 'death':
        return { book: { ...b, deaths: b.deaths.filter((d) => d.id !== id) } }
      case 'payment':
        return { book: { ...b, payments: b.payments.filter((p) => p.id !== id) } }
      case 'expense':
        return { book: { ...b, expenses: b.expenses.filter((e) => e.id !== id) } }
      case 'customer':
      case 'supplier': {
        fail(whyCantDeleteParty(b, change.entity, id))
        return change.entity === 'customer'
          ? { book: { ...b, customers: b.customers.filter((p) => p.id !== id) } }
          : { book: { ...b, suppliers: b.suppliers.filter((p) => p.id !== id) } }
      }
    }
  }

  switch (change.entity) {
    case 'challan': {
      const input = change.data
      fail(checkChallan(b, input))
      const old = b.challans.find((c) => c.id === input.id)
      const challan: Challan = {
        ...old,
        id: input.id,
        number: old?.number ?? nextNumber(b.challans),
        bought_on: input.bought_on,
        supplier_id: input.supplier_id,
        paid_now: input.paid_now,
        paid_from: input.paid_from,
        notes: clean(input.notes),
        created_at: old?.created_at ?? stamp(),
      }
      const lines: ChallanLine[] = input.lines.map((l, position) => ({
        id: l.id,
        challan_id: input.id,
        animal: l.animal.trim(),
        head: l.head,
        cost: l.cost,
        position,
      }))
      return {
        book: {
          ...b,
          challans: upsert(b.challans, challan),
          challanLines: [...b.challanLines.filter((l) => l.challan_id !== input.id), ...lines],
        },
        number: challan.number,
      }
    }
    case 'sale': {
      const input = change.data
      fail(checkSale(b, input))
      const old = b.sales.find((s) => s.id === input.id)
      const sale: Sale = {
        ...old,
        id: input.id,
        number: old?.number ?? nextNumber(b.sales),
        sold_on: input.sold_on,
        customer_id: input.customer_id,
        received_now: input.received_now,
        received_in: input.received_in,
        notes: clean(input.notes),
        created_at: old?.created_at ?? stamp(),
      }
      const lines: SaleLine[] = input.lines.map((l, position) => ({
        id: l.id,
        sale_id: input.id,
        challan_line_id: l.challan_line_id,
        head: l.head,
        amount: l.amount,
        damaged: l.damaged,
        position,
      }))
      return {
        book: { ...b, sales: upsert(b.sales, sale), saleLines: [...b.saleLines.filter((l) => l.sale_id !== input.id), ...lines] },
        number: sale.number,
      }
    }
    case 'death': {
      const input = change.data
      fail(checkDeath(b, input))
      const old = b.deaths.find((d) => d.id === input.id)
      return {
        book: { ...b, deaths: upsert(b.deaths, { ...old, ...input, cause: clean(input.cause), created_at: old?.created_at ?? stamp() }) },
      }
    }
    case 'payment': {
      const p = tidyPayment(change.data)
      fail(checkPayment(b, p))
      const old = b.payments.find((x) => x.id === p.id)
      return { book: { ...b, payments: upsert(b.payments, { ...old, ...p, created_at: old?.created_at ?? stamp() }) } }
    }
    case 'expense': {
      const input = change.data
      fail(checkExpense(b, input))
      const old = b.expenses.find((e) => e.id === input.id)
      return {
        book: {
          ...b,
          expenses: upsert(b.expenses, {
            ...old,
            ...input,
            category: input.category.trim(),
            notes: clean(input.notes),
            created_at: old?.created_at ?? stamp(),
          }),
        },
      }
    }
    case 'customer':
    case 'supplier': {
      const kind = change.entity
      const input = change.data
      fail(checkParty(b, kind, input))
      const list = kind === 'customer' ? b.customers : b.suppliers
      const old = list.find((p) => p.id === input.id)
      const party: Party = {
        ...old,
        ...input,
        name: input.name.trim(),
        phone: clean(input.phone),
        notes: clean(input.notes),
        created_at: old?.created_at ?? stamp(),
      }
      return { book: kind === 'customer' ? { ...b, customers: upsert(list, party) } : { ...b, suppliers: upsert(list, party) } }
    }
    case 'settings': {
      const settings = change.data
      fail(settings.business_name.trim() ? null : t('Enter the business name.'))
      fail(
        Number.isFinite(settings.opening_cash) && Number.isFinite(settings.opening_bank)
          ? null
          : t('Enter the opening balances, or 0.'),
      )
      return { book: { ...b, settings: { ...b.settings, ...settings, business_name: settings.business_name.trim() } } }
    }
  }
}

/** The records a change points at, so it waits while one of them can't be saved. */
export function changeRefersTo(book: Book, change: Change): string[] {
  if (change.action === 'delete') return []
  const challanOfLine = (lineId: string) => book.challanLines.find((l) => l.id === lineId)?.challan_id
  const keys: (string | null | undefined)[] = []
  switch (change.entity) {
    case 'challan':
      keys.push(`supplier:${change.data.supplier_id}`)
      break
    case 'sale':
      if (change.data.customer_id) keys.push(`customer:${change.data.customer_id}`)
      for (const l of change.data.lines) {
        const c = challanOfLine(l.challan_line_id)
        if (c) keys.push(`challan:${c}`)
      }
      break
    case 'death': {
      const c = challanOfLine(change.data.challan_line_id)
      if (c) keys.push(`challan:${c}`)
      break
    }
    case 'payment':
      if (change.data.customer_id) keys.push(`customer:${change.data.customer_id}`)
      if (change.data.supplier_id) keys.push(`supplier:${change.data.supplier_id}`)
      break
    case 'expense':
      if (change.data.challan_id) keys.push(`challan:${change.data.challan_id}`)
      break
  }
  return keys.filter((k): k is string => Boolean(k))
}
