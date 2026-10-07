/** Where money sits: the cash box or the bank account. */
export type Account = 'cash' | 'bank'

/**
 * Kept with each record read from the server, for working offline: the record's
 * version there, and the change that last wrote it. Absent in the demo.
 */
export type Synced = { version?: number; last_op?: string | null }

export type Settings = Synced & {
  business_name: string
  /** Money in hand and in the bank on the day the business started using the app. */
  opening_cash: number
  opening_bank: number
}

/** A customer or a supplier. Both keep a running ledger. */
export type Party = Synced & {
  id: string
  name: string
  phone: string | null
  notes: string | null
  /**
   * What was already owed before the app: for a customer, what they owed you;
   * for a supplier, what you owed them. Negative means it ran the other way.
   */
  opening_balance: number
  created_at: string
}

export type PartyKind = 'customer' | 'supplier'

/** One bulk purchase of animals. */
export type Challan = Synced & {
  id: string
  number: number
  bought_on: string
  supplier_id: string
  /** Paid at the time of purchase. The rest goes on the supplier's ledger. */
  paid_now: number
  paid_from: Account
  notes: string | null
  created_at: string
}

/** One kind of animal on a challan: how many, and what they cost together. */
export type ChallanLine = {
  id: string
  challan_id: string
  animal: string
  head: number
  cost: number
  position: number
}

export type Sale = Synced & {
  id: string
  number: number
  sold_on: string
  /** Null for a walk-in customer, who always pays in full. */
  customer_id: string | null
  /** Received at the time of sale. The rest goes on the customer's ledger. */
  received_now: number
  received_in: Account
  notes: string | null
  created_at: string
}

/** Animals of one kind, from one challan, on a sale. */
export type SaleLine = {
  id: string
  sale_id: string
  challan_line_id: string
  head: number
  amount: number
  /** Sold cheap because the animal was injured or sick. */
  damaged: boolean
  position: number
}

export type Death = Synced & {
  id: string
  died_on: string
  challan_line_id: string
  head: number
  cause: string | null
  created_at: string
}

export type PaymentKind =
  | 'from_customer'
  | 'to_supplier'
  | 'cash_to_bank'
  | 'bank_to_cash'
  | 'owner_in'
  | 'owner_out'

/** Money that moves on its own: a later payment, a transfer, or the owner's own money. */
export type Payment = Synced & {
  id: string
  paid_on: string
  kind: PaymentKind
  customer_id: string | null
  supplier_id: string | null
  /** Null for a transfer, which always runs between the two accounts. */
  account: Account | null
  amount: number
  notes: string | null
  created_at: string
}

export type Expense = Synced & {
  id: string
  spent_on: string
  category: string
  amount: number
  paid_from: Account
  /** Set when the cost belongs to one challan, such as its transport or fodder. */
  challan_id: string | null
  notes: string | null
  created_at: string
}

/** Everything the business has recorded. Every report is worked out from this. */
export type Book = {
  settings: Settings
  customers: Party[]
  suppliers: Party[]
  challans: Challan[]
  challanLines: ChallanLine[]
  sales: Sale[]
  saleLines: SaleLine[]
  deaths: Death[]
  payments: Payment[]
  expenses: Expense[]
}

export type PartyInput = Omit<Party, 'created_at'>
export type ChallanLineInput = Pick<ChallanLine, 'id' | 'animal' | 'head' | 'cost'>
export type ChallanInput = Omit<Challan, 'number' | 'created_at'> & { lines: ChallanLineInput[] }
export type SaleLineInput = Pick<SaleLine, 'id' | 'challan_line_id' | 'head' | 'amount' | 'damaged'>
export type SaleInput = Omit<Sale, 'number' | 'created_at'> & { lines: SaleLineInput[] }
export type DeathInput = Omit<Death, 'created_at'>
export type PaymentInput = Omit<Payment, 'created_at'>
export type ExpenseInput = Omit<Expense, 'created_at'>

export const DEFAULT_SETTINGS: Settings = {
  business_name: 'My Mandi',
  opening_cash: 0,
  opening_bank: 0,
}

export function emptyBook(): Book {
  return {
    settings: { ...DEFAULT_SETTINGS },
    customers: [],
    suppliers: [],
    challans: [],
    challanLines: [],
    sales: [],
    saleLines: [],
    deaths: [],
    payments: [],
    expenses: [],
  }
}
