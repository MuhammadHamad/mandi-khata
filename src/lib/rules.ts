/**
 * What may be saved or deleted, in words staff can act on. The forms check
 * these before saving, and the demo backend enforces them; the database
 * enforces the same rules for real (supabase/setup.sql), so a phone with an
 * old copy of the books cannot slip past them.
 */
import { t } from './i18n'
import type {
  Book,
  ChallanInput,
  DeathInput,
  ExpenseInput,
  PartyInput,
  PartyKind,
  PaymentInput,
  SaleInput,
} from './types'

const nameKey = (s: string) => s.trim().toLowerCase()
const isCount = (n: number) => Number.isInteger(n) && n > 0
const isMoney = (n: number) => Number.isFinite(n) && n >= 0
const isAmount = (n: number) => Number.isFinite(n) && n > 0
/** Equal to the paisa: sums of typed amounts can carry float dust. */
export const same = (a: number, b: number) => Math.abs(a - b) < 0.005

/** Animals still on a line, leaving out the sale or death being edited. */
export function available(book: Book, lineId: string, skip: { saleId?: string; deathId?: string } = {}): number {
  const line = book.challanLines.find((l) => l.id === lineId)
  if (!line) return 0
  let used = 0
  for (const sl of book.saleLines) if (sl.challan_line_id === lineId && sl.sale_id !== skip.saleId) used += sl.head
  for (const d of book.deaths) if (d.challan_line_id === lineId && d.id !== skip.deathId) used += d.head
  return line.head - used
}

/** "Only 9 Goat left in challan #4." */
function leftMessage(book: Book, lineId: string, left: number): string {
  const line = book.challanLines.find((l) => l.id === lineId)
  const challan = book.challans.find((c) => c.id === line?.challan_id)
  const animal = line?.animal ?? t('animals')
  if (!challan) return left > 0 ? t('Only {left} {animal} left.', { left, animal }) : t('No {animal} left.', { animal })
  const n = challan.number
  return left > 0
    ? t('Only {left} {animal} left in challan #{n}.', { left, animal, n })
    : t('No {animal} left in challan #{n}.', { animal, n })
}

export function checkChallan(book: Book, input: ChallanInput): string | null {
  if (!input.supplier_id || !book.suppliers.some((s) => s.id === input.supplier_id)) return t('Pick the supplier.')
  if (!input.bought_on) return t('Enter the date.')
  if (input.lines.length === 0) return t('Add at least one kind of animal.')
  const seen = new Set<string>()
  for (const l of input.lines) {
    const animal = l.animal.trim()
    if (!animal) return t('Enter the kind of animal on every line.')
    if (seen.has(nameKey(animal))) return t('{animal} is on two lines. Put each kind of animal on one line.', { animal })
    seen.add(nameKey(animal))
    if (!isCount(l.head)) return t('Enter how many {animal} (a whole number).', { animal })
    if (!isMoney(l.cost)) return t('Enter what the {animal} cost.', { animal })
  }
  const total = input.lines.reduce((sum, l) => sum + l.cost, 0)
  if (!isMoney(input.paid_now)) return t('Enter how much was paid now, or 0.')
  if (input.paid_now > total && !same(input.paid_now, total)) return t('Paid now is more than the challan total.')

  // Editing: animals already sold or dead cannot be taken off the challan.
  for (const old of book.challanLines) {
    if (old.challan_id !== input.id) continue
    const used = old.head - available(book, old.id)
    if (used === 0) continue
    const kept = input.lines.find((l) => l.id === old.id)
    if (!kept) return t("{animal} already has sales or deaths, so it can't be taken off this challan.", { animal: old.animal })
    if (kept.head < used) {
      return t("{used} {animal} are already sold or dead, so the count can't go below {used}.", { used, animal: old.animal })
    }
  }
  return null
}

export function checkSale(book: Book, input: SaleInput): string | null {
  if (!input.sold_on) return t('Enter the date.')
  if (input.customer_id && !book.customers.some((c) => c.id === input.customer_id)) return t('Pick the customer again.')
  if (input.lines.length === 0) return t('Add at least one animal.')
  const wanted = new Map<string, number>()
  for (const l of input.lines) {
    if (!l.challan_line_id) return t('Pick which challan each animal came from.')
    if (!isCount(l.head)) return t('Enter how many animals (a whole number).')
    if (!isMoney(l.amount)) return t('Enter the price.')
    wanted.set(l.challan_line_id, (wanted.get(l.challan_line_id) ?? 0) + l.head)
  }
  for (const [lineId, head] of wanted) {
    const left = available(book, lineId, { saleId: input.id })
    if (head > left) return leftMessage(book, lineId, left)
  }
  const total = input.lines.reduce((sum, l) => sum + l.amount, 0)
  if (!isMoney(input.received_now)) return t('Enter how much was received now, or 0.')
  if (input.received_now > total && !same(input.received_now, total)) return t('Received now is more than the sale total.')
  if (!input.customer_id && !same(input.received_now, total)) {
    return t('A walk-in customer must pay in full. Pick a customer to sell on credit.')
  }
  return null
}

export function checkDeath(book: Book, input: DeathInput): string | null {
  if (!input.challan_line_id) return t('Pick which animal died.')
  if (!input.died_on) return t('Enter the date.')
  if (!isCount(input.head)) return t('Enter how many died (a whole number).')
  const left = available(book, input.challan_line_id, { deathId: input.id })
  if (input.head > left) return leftMessage(book, input.challan_line_id, left)
  return null
}

export function checkPayment(book: Book, input: PaymentInput): string | null {
  if (!input.paid_on) return t('Enter the date.')
  if (!isAmount(input.amount)) return t('Enter the amount.')
  switch (input.kind) {
    case 'from_customer':
      if (!input.customer_id || !book.customers.some((c) => c.id === input.customer_id)) return t('Pick the customer.')
      break
    case 'to_supplier':
      if (!input.supplier_id || !book.suppliers.some((s) => s.id === input.supplier_id)) return t('Pick the supplier.')
      break
  }
  const transfer = input.kind === 'cash_to_bank' || input.kind === 'bank_to_cash'
  if (!transfer && !input.account) return t('Pick cash or bank.')
  return null
}

export function checkExpense(book: Book, input: ExpenseInput): string | null {
  if (!input.spent_on) return t('Enter the date.')
  if (!input.category.trim()) return t('Say what the money was spent on.')
  if (!isAmount(input.amount)) return t('Enter the amount.')
  if (input.challan_id && !book.challans.some((c) => c.id === input.challan_id)) return t('Pick the challan again.')
  return null
}

export function checkParty(book: Book, kind: PartyKind, input: PartyInput): string | null {
  const name = input.name.trim()
  if (!name) return t('Enter the name.')
  if (!Number.isFinite(input.opening_balance)) return t('Enter the opening balance, or 0.')
  const list = kind === 'customer' ? book.customers : book.suppliers
  if (list.some((p) => p.id !== input.id && nameKey(p.name) === nameKey(name))) {
    return kind === 'customer'
      ? t('There is already a customer called {name}.', { name })
      : t('There is already a supplier called {name}.', { name })
  }
  return null
}

export function whyCantDeleteChallan(book: Book, challanId: string): string | null {
  const lineIds = new Set(book.challanLines.filter((l) => l.challan_id === challanId).map((l) => l.id))
  if (book.saleLines.some((l) => lineIds.has(l.challan_line_id))) return t('This challan has sales. Delete those sales first.')
  if (book.deaths.some((d) => lineIds.has(d.challan_line_id))) return t('This challan has deaths recorded. Delete those first.')
  if (book.expenses.some((e) => e.challan_id === challanId)) {
    return t('This challan has expenses linked to it. Delete them or move them off this challan first.')
  }
  return null
}

export function whyCantDeleteParty(book: Book, kind: PartyKind, id: string): string | null {
  if (kind === 'customer') {
    if (book.sales.some((s) => s.customer_id === id)) return t("This customer has sales, so they can't be deleted.")
    if (book.payments.some((p) => p.customer_id === id)) return t("This customer has payments, so they can't be deleted.")
  } else {
    if (book.challans.some((c) => c.supplier_id === id)) return t("This supplier has challans, so they can't be deleted.")
    if (book.payments.some((p) => p.supplier_id === id)) return t("This supplier has payments, so they can't be deleted.")
  }
  return null
}
