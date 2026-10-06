import type {
  Book,
  ChallanInput,
  DeathInput,
  ExpenseInput,
  PartyInput,
  PartyKind,
  PaymentInput,
  SaleInput,
  Settings,
} from '../lib/types'

export type User = { email: string }

/**
 * Everything the app asks of its storage. Two implement it: the Supabase
 * database (live.ts) and a copy kept in the browser for trying the app
 * (demo.ts). Every method throws an Error whose message can be shown as is.
 */
export type Backend = {
  demo: boolean

  session(): Promise<User | null>
  onAuthChange(listener: (user: User | null) => void): () => void
  signIn(email: string, password: string): Promise<User>
  signOut(): Promise<void>

  load(): Promise<Book>
  saveChallan(input: ChallanInput): Promise<{ id: string; number: number }>
  deleteChallan(id: string): Promise<void>
  saveSale(input: SaleInput): Promise<{ id: string; number: number }>
  deleteSale(id: string): Promise<void>
  saveDeath(input: DeathInput): Promise<void>
  deleteDeath(id: string): Promise<void>
  savePayment(input: PaymentInput): Promise<void>
  deletePayment(id: string): Promise<void>
  saveExpense(input: ExpenseInput): Promise<void>
  deleteExpense(id: string): Promise<void>
  saveParty(kind: PartyKind, input: PartyInput): Promise<void>
  deleteParty(kind: PartyKind, id: string): Promise<void>
  saveSettings(settings: Settings): Promise<void>

  /** Demo only: start over, empty or with the sample books. */
  resetDemo?(withSample: boolean): Promise<void>
}

/** Blank text is stored as nothing. */
export function clean(text: string | null | undefined): string | null {
  const t = text?.trim()
  return t ? t : null
}

/** A payment carries only the fields its kind uses. */
export function tidyPayment(p: PaymentInput): PaymentInput {
  const transfer = p.kind === 'cash_to_bank' || p.kind === 'bank_to_cash'
  return {
    ...p,
    customer_id: p.kind === 'from_customer' ? p.customer_id : null,
    supplier_id: p.kind === 'to_supplier' ? p.supplier_id : null,
    account: transfer ? null : p.account,
    notes: clean(p.notes),
  }
}
