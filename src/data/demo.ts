/**
 * The demo backend: the whole book lives in the browser (localStorage), so
 * the app can be tried with no database. It enforces the same rules the
 * database does (see src/lib/rules.ts and supabase/setup.sql).
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
import { emptyBook } from '../lib/types'
import type { Book, Challan, ChallanLine, Party, Sale, SaleLine } from '../lib/types'
import { clean, tidyPayment } from './api'
import type { Backend } from './api'
import { fillSample } from './sample'

export type Store = { read(): string | null; write(value: string): void }

export function memoryStore(): Store {
  let value: string | null = null
  return { read: () => value, write: (v) => void (value = v) }
}

export function browserStore(key: string): Store {
  return {
    read: () => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    write: (value) => {
      try {
        localStorage.setItem(key, value)
      } catch {
        // Private window or storage full: the book still lives for this visit.
      }
    },
  }
}

function fail(message: string | null): void {
  if (message) throw new Error(message)
}

function upsert<T extends { id: string }>(rows: T[], row: T): T[] {
  return rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row]
}

const nextNumber = (rows: { number: number }[]) => rows.reduce((max, r) => Math.max(max, r.number), 0) + 1

export function createDemoBackend(store: Store, opts: { sample?: boolean; today: () => string }): Backend {
  let book: Book | null = null
  let ready: Promise<void> | null = null

  // Strictly increasing, so records saved in the same millisecond keep their order.
  let lastStamp = 0
  const stamp = () => {
    lastStamp = Math.max(Date.now(), lastStamp + 1)
    return new Date(lastStamp).toISOString()
  }

  const read = (): Book | null => {
    const raw = store.read()
    if (!raw) return null
    try {
      return { ...emptyBook(), ...(JSON.parse(raw) as Partial<Book>) }
    } catch {
      return null
    }
  }
  const get = (): Book => (book ??= read() ?? emptyBook())
  const commit = (next: Book) => {
    book = next
    store.write(JSON.stringify(next))
  }

  const api: Backend = {
    demo: true,

    session: async () => ({ email: 'Demo' }),
    onAuthChange: () => () => {},
    signIn: async () => ({ email: 'Demo' }),
    signOut: async () => {},

    async load() {
      ready ??= (async () => {
        const saved = read()
        if (saved) {
          book = saved
          return
        }
        commit(emptyBook())
        if (opts.sample !== false) await fillSample(api, opts.today())
      })()
      await ready
      return structuredClone(get())
    },

    async saveChallan(input) {
      const b = get()
      fail(checkChallan(b, input))
      const old = b.challans.find((c) => c.id === input.id)
      const challan: Challan = {
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
      commit({
        ...b,
        challans: upsert(b.challans, challan),
        challanLines: [...b.challanLines.filter((l) => l.challan_id !== input.id), ...lines],
      })
      return { id: challan.id, number: challan.number }
    },

    async deleteChallan(id) {
      const b = get()
      fail(whyCantDeleteChallan(b, id))
      commit({
        ...b,
        challans: b.challans.filter((c) => c.id !== id),
        challanLines: b.challanLines.filter((l) => l.challan_id !== id),
      })
    },

    async saveSale(input) {
      const b = get()
      fail(checkSale(b, input))
      const old = b.sales.find((s) => s.id === input.id)
      const sale: Sale = {
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
      commit({
        ...b,
        sales: upsert(b.sales, sale),
        saleLines: [...b.saleLines.filter((l) => l.sale_id !== input.id), ...lines],
      })
      return { id: sale.id, number: sale.number }
    },

    async deleteSale(id) {
      const b = get()
      commit({ ...b, sales: b.sales.filter((s) => s.id !== id), saleLines: b.saleLines.filter((l) => l.sale_id !== id) })
    },

    async saveDeath(input) {
      const b = get()
      fail(checkDeath(b, input))
      const old = b.deaths.find((d) => d.id === input.id)
      commit({ ...b, deaths: upsert(b.deaths, { ...input, cause: clean(input.cause), created_at: old?.created_at ?? stamp() }) })
    },

    async deleteDeath(id) {
      const b = get()
      commit({ ...b, deaths: b.deaths.filter((d) => d.id !== id) })
    },

    async savePayment(input) {
      const b = get()
      const p = tidyPayment(input)
      fail(checkPayment(b, p))
      const old = b.payments.find((x) => x.id === p.id)
      commit({ ...b, payments: upsert(b.payments, { ...p, created_at: old?.created_at ?? stamp() }) })
    },

    async deletePayment(id) {
      const b = get()
      commit({ ...b, payments: b.payments.filter((p) => p.id !== id) })
    },

    async saveExpense(input) {
      const b = get()
      fail(checkExpense(b, input))
      const old = b.expenses.find((e) => e.id === input.id)
      commit({
        ...b,
        expenses: upsert(b.expenses, {
          ...input,
          category: input.category.trim(),
          notes: clean(input.notes),
          created_at: old?.created_at ?? stamp(),
        }),
      })
    },

    async deleteExpense(id) {
      const b = get()
      commit({ ...b, expenses: b.expenses.filter((e) => e.id !== id) })
    },

    async saveParty(kind, input) {
      const b = get()
      fail(checkParty(b, kind, input))
      const list = kind === 'customer' ? b.customers : b.suppliers
      const old = list.find((p) => p.id === input.id)
      const party: Party = {
        ...input,
        name: input.name.trim(),
        phone: clean(input.phone),
        notes: clean(input.notes),
        created_at: old?.created_at ?? stamp(),
      }
      commit(kind === 'customer' ? { ...b, customers: upsert(list, party) } : { ...b, suppliers: upsert(list, party) })
    },

    async deleteParty(kind, id) {
      const b = get()
      fail(whyCantDeleteParty(b, kind, id))
      commit(
        kind === 'customer'
          ? { ...b, customers: b.customers.filter((p) => p.id !== id) }
          : { ...b, suppliers: b.suppliers.filter((p) => p.id !== id) },
      )
    },

    async saveSettings(settings) {
      const b = get()
      fail(settings.business_name.trim() ? null : t('Enter the business name.'))
      fail(
        Number.isFinite(settings.opening_cash) && Number.isFinite(settings.opening_bank)
          ? null
          : t('Enter the opening balances, or 0.'),
      )
      commit({ ...b, settings: { ...settings, business_name: settings.business_name.trim() } })
    },

    async resetDemo(withSample) {
      commit(emptyBook())
      ready = Promise.resolve()
      if (withSample) await fillSample(api, opts.today())
    },
  }
  return api
}
