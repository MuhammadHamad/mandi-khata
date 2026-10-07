/**
 * The demo backend: the whole book lives in the browser (localStorage), so
 * the app can be tried with no database. Its changes pass the same rules the
 * database enforces (src/data/changes.ts, src/lib/rules.ts, supabase/setup.sql).
 */
import { emptyBook } from '../lib/types'
import type { Book } from '../lib/types'
import type { Backend } from './api'
import { applyChange } from './changes'
import type { Change } from './changes'
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
  /** Makes one change and keeps it; a new challan or sale gets its number back. */
  const change = (c: Change): number | undefined => {
    const done = applyChange(get(), c, stamp)
    commit(done.book)
    return done.number
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
      return { id: input.id, number: change({ entity: 'challan', action: 'save', id: input.id, data: input })! }
    },
    async deleteChallan(id) {
      change({ entity: 'challan', action: 'delete', id })
    },
    async saveSale(input) {
      return { id: input.id, number: change({ entity: 'sale', action: 'save', id: input.id, data: input })! }
    },
    async deleteSale(id) {
      change({ entity: 'sale', action: 'delete', id })
    },
    async saveDeath(input) {
      change({ entity: 'death', action: 'save', id: input.id, data: input })
    },
    async deleteDeath(id) {
      change({ entity: 'death', action: 'delete', id })
    },
    async savePayment(input) {
      change({ entity: 'payment', action: 'save', id: input.id, data: input })
    },
    async deletePayment(id) {
      change({ entity: 'payment', action: 'delete', id })
    },
    async saveExpense(input) {
      change({ entity: 'expense', action: 'save', id: input.id, data: input })
    },
    async deleteExpense(id) {
      change({ entity: 'expense', action: 'delete', id })
    },
    async saveParty(kind, input) {
      change({ entity: kind, action: 'save', id: input.id, data: input })
    },
    async deleteParty(kind, id) {
      change({ entity: kind, action: 'delete', id })
    },
    async saveSettings(settings) {
      change({ entity: 'settings', action: 'save', id: 'settings', data: settings })
    },

    async resetDemo(withSample) {
      commit(emptyBook())
      ready = Promise.resolve()
      if (withSample) await fillSample(api, opts.today())
    },
  }
  return api
}
