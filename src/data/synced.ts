/**
 * The live app, working offline first. The books open from the copy kept on
 * the phone (local.ts), so every page works with no internet. Each save checks
 * the same rules as the server against that copy, changes it at once, keeps it
 * on the phone, and only then goes into a queue for the server. The queue is
 * sent in order whenever the server can be reached:
 *
 *   * a change is sent with its own id, so one sent twice (its reply lost on a
 *     bad connection) is done once;
 *   * a change to a record someone changed on another phone meanwhile comes
 *     back as a conflict, for the owner to keep theirs or the other copy;
 *   * a change the server refuses (another phone sold those animals first) is
 *     kept, with the reason, until the owner fixes or drops it, and anything
 *     that depends on it waits rather than failing too.
 *
 * After sending, the whole server copy is fetched again, so numbers given by
 * the server and other phones' changes show up, and the queue is laid on top.
 */
import { paymentLabel } from '../lib/books'
import { rs } from '../lib/format'
import { t } from '../lib/i18n'
import { uuid } from '../lib/ids'
import { emptyBook } from '../lib/types'
import type { Book } from '../lib/types'
import type { Backend } from './api'
import { applyChange, changeRefersTo, recordKey } from './changes'
import type { Change } from './changes'
import type { LocalStore, Queued } from './local'

/** The server, as the queue sees it. */
export type Remote = {
  pull(): Promise<Book>
  push(change: Queued): Promise<{ status: 'ok'; number?: number | null } | { status: 'conflict' }>
}

/** The server could not be reached: the change stays queued and is tried again later. */
export class Unreachable extends Error {}
/** The sign-in has run out: the queue waits until the owner signs in again. */
export class SignedOut extends Error {}

export type Auth = Pick<Backend, 'session' | 'onAuthChange' | 'signIn' | 'signOut'>

export type SyncState = {
  /** The phone has a connection and the server answered last time it was asked. */
  online: boolean
  syncing: boolean
  /** Changes made here that the server has not confirmed yet, with their troubles. */
  queue: Queued[]
  waiting: number
  problems: Queued[]
  signedOut: boolean
  /** When the server's copy was last fetched. */
  lastSync: string | null
}

export type SyncControl = {
  state(): SyncState
  subscribe(listener: (booksChanged: boolean) => void): () => void
  /** Sends what is waiting and fetches the server's copy. */
  syncNow(): Promise<void>
  /** A conflict: send this phone's copy over the other one. */
  keepMine(op: string): Promise<void>
  /** A conflict or a refusal: drop this phone's change and keep the server's copy. */
  drop(op: string): Promise<void>
  /** A refusal: try sending it again as it is. */
  retry(op: string): Promise<void>
}

type Options = {
  remote: Remote
  auth: Auth
  local: LocalStore
  now?: () => string
  /** The browser's own view: no point trying the server with no connection at all. */
  isOnline?: () => boolean
  /** Waits and timers, off in the checks, which drive syncing by hand. */
  timers?: boolean
}

const RETRY_SECONDS = [5, 15, 30, 60, 120]

export function createSyncedBackend(opts: Options): Backend & { sync: SyncControl } {
  const { remote, auth, local } = opts
  const now = opts.now ?? (() => new Date().toISOString())
  const isOnline = opts.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const timers = opts.timers ?? true

  let key: string | null = null
  let server: Book | null = null
  let queue: Queued[] = []
  let pulledAt: string | null = null
  let book: Book = emptyBook()
  let restoring: Promise<void> | null = null
  let started = false
  let busy = false
  let again = false
  let reachable = true
  let signedOut = false
  let failures = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let writing: Promise<void> = Promise.resolve()
  const listeners = new Set<(booksChanged: boolean) => void>()
  let snapshot: SyncState | null = null

  // Strictly increasing, so records saved in the same millisecond keep their order.
  let lastStamp = 0
  const stamp = () => {
    lastStamp = Math.max(Date.now(), lastStamp + 1)
    return new Date(lastStamp).toISOString()
  }

  const emit = (booksChanged = false) => {
    snapshot = null
    for (const l of listeners) l(booksChanged)
  }

  /** Writes come one after another, so an older copy never lands over a newer one. */
  const persist = () => {
    const k = key
    if (!k) return Promise.resolve()
    const saved = { server, queue, pulledAt }
    writing = writing.then(() => local.write(`book:${k}`, structuredClone(saved))).catch(() => {})
    return writing
  }

  /** The copy for whoever is signed in, from the phone; a different login starts afresh. */
  async function ensure(): Promise<void> {
    const user = await auth.session()
    const k = user?.email ?? null
    if (!k) throw new SignedOut(t('You have been signed out. Please sign in again.'))
    if (k !== key) {
      key = k
      started = false
      restoring = (async () => {
        const saved = await local.read(`book:${k}`)
        server = saved?.server ?? null
        queue = saved?.queue ?? []
        pulledAt = saved?.pulledAt ?? null
        rebase()
      })()
    }
    await restoring
  }

  const listOf = (b: Book, entity: Change['entity']) =>
    entity === 'challan'
      ? b.challans
      : entity === 'sale'
        ? b.sales
        : entity === 'death'
          ? b.deaths
          : entity === 'payment'
            ? b.payments
            : entity === 'expense'
              ? b.expenses
              : entity === 'customer'
                ? b.customers
                : entity === 'supplier'
                  ? b.suppliers
                  : []

  /** The record as the server last showed it, or undefined. */
  function onServer(c: Pick<Change, 'entity' | 'id'>): { version?: number; last_op?: string | null } | undefined {
    if (!server) return undefined
    if (c.entity === 'settings') return server.settings
    return (listOf(server, c.entity) as { id: string; version?: number; last_op?: string | null }[]).find((r) => r.id === c.id)
  }

  /**
   * The phone's copy: the server's, with the queue laid on top. Changes the server's
   * copy shows as done (their reply was lost) leave the queue; a change that no longer
   * fits (another phone sold those animals first) is set aside with the reason.
   */
  function rebase(): void {
    // A change done on the server takes every earlier change to that record with it.
    const doneUpTo = new Map<string, number>()
    queue.forEach((q, i) => {
      if (q.action === 'save' ? onServer(q)?.last_op === q.op : q.sent && !onServer(q)) doneUpTo.set(recordKey(q), i)
    })
    queue = queue.filter((q, i) => !(i <= (doneUpTo.get(recordKey(q)) ?? -1)))

    let b: Book = server ?? emptyBook()
    for (const q of queue) {
      try {
        b = applyChange(b, q, stamp).book
        if (q.state === 'failed' && q.local) {
          q.state = 'waiting'
          q.problem = undefined
          q.local = false
        }
      } catch (e) {
        if (q.state === 'waiting' || (q.state === 'failed' && q.local)) {
          q.state = 'failed'
          q.problem = (e as Error).message
          q.local = true
        }
      }
    }
    book = b
  }

  function enqueue(change: Change, label: string): void {
    const k = recordKey(change)
    const lastIndex = queue.map(recordKey).lastIndexOf(k)
    const last = lastIndex >= 0 ? queue[lastIndex] : undefined
    // Not on the server yet (never sent, or refused): only the latest wish for this record counts.
    if (last && (!last.sent || last.state === 'failed')) {
      if (change.action === 'delete' && last.base === null && last.after === null && !onServer(change)) {
        // Made on this phone and never sent: deleting it means it never was.
        queue.splice(lastIndex, 1)
        return
      }
      queue[lastIndex] = {
        ...change,
        op: last.op,
        base: last.base,
        after: last.after,
        force: last.force,
        sent: false,
        state: last.state === 'conflict' ? 'conflict' : 'waiting',
        at: now(),
        label,
      }
      return
    }
    const rec = onServer(change)
    queue.push({
      ...change,
      op: uuid(),
      // Only a record the server has stored carries a version; the default settings of a new business do not.
      base: rec?.version ?? null,
      after: last?.op ?? null,
      sent: false,
      state: 'waiting',
      at: now(),
      label,
    })
  }

  /** Makes a change on the phone, keeps it, and queues it for the server. */
  async function make(change: Change): Promise<number | undefined> {
    await ensure()
    const before = book
    // Refused here exactly as the server would refuse it, with the same words.
    const done = applyChange(book, change, stamp)
    enqueue(change, describe(before, done.book, change))
    // Laid out again from the server's copy, so a change that fixes another (renaming a
    // refused customer) frees the ones that were waiting on it at once.
    rebase()
    await persist()
    emit(true)
    kick()
    return done.number
  }

  // ------------------------------------------------------------ syncing --

  const kick = () => {
    if (!timers) return
    if (busy) {
      again = true
      return
    }
    setTimeout(() => void syncNow(), 50)
  }

  /** Asks the browser to wake the app when the connection is back (Chrome and Edge; others rely on the timers). */
  function wakeOnConnection(): void {
    if (!timers || typeof navigator === 'undefined' || !navigator.serviceWorker) return
    void navigator.serviceWorker.ready
      .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register('mandi-sync'))
      .catch(() => {})
  }

  function retryLater(): void {
    wakeOnConnection()
    if (!timers || retryTimer) return
    const seconds = RETRY_SECONDS[Math.min(failures, RETRY_SECONDS.length - 1)]
    failures += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      void syncNow()
    }, seconds * 1000)
  }

  /** Sends the queue in order. Returns whether anything reached the server. */
  async function push(): Promise<boolean> {
    let landed = false
    const stuck = new Set<string>()
    for (const q of [...queue]) {
      if (!queue.includes(q)) continue
      const k = recordKey(q)
      const refs = changeRefersTo(book, q)
      if (q.state !== 'waiting' || stuck.has(k) || refs.some((r) => stuck.has(r))) {
        stuck.add(k)
        continue
      }
      q.sent = true
      await persist()
      let result: Awaited<ReturnType<Remote['push']>>
      try {
        result = await remote.push(q)
      } catch (e) {
        if (e instanceof Unreachable) {
          reachable = false
          retryLater()
          return landed
        }
        if (e instanceof SignedOut) {
          signedOut = true
          return landed
        }
        q.state = 'failed'
        q.problem = (e as Error).message
        q.local = false
        stuck.add(k)
        await persist()
        emit()
        continue
      }
      reachable = true
      signedOut = false
      failures = 0
      if (result.status === 'conflict') {
        q.state = 'conflict'
        q.problem = undefined
        stuck.add(k)
      } else {
        landed = true
        // Done. The phone's copy of the server takes it now, so it never drops out of
        // sight while the fresh copy is fetched; if that copy is too far behind to take
        // it, the change waits for the fetch (sending it again would do nothing twice).
        try {
          server = applyChange(server ?? emptyBook(), q, stamp).book
          if (q.action === 'save') {
            const rec = onServer(q) as { version?: number; last_op?: string | null; number?: number } | undefined
            if (rec) Object.assign(rec, { last_op: q.op, ...(result.number ? { number: result.number } : {}) })
          }
          queue = queue.filter((x) => x !== q)
        } catch {
          // Left in the queue, already sent.
        }
      }
      await persist()
      emit()
    }
    return landed
  }

  /** Fetches the server's copy and lays the queue on top. */
  async function pull(): Promise<void> {
    try {
      server = await remote.pull()
      pulledAt = now()
      reachable = true
      signedOut = false
      failures = 0
      rebase()
      await persist()
      emit(true)
    } catch (e) {
      if (e instanceof Unreachable) {
        reachable = false
        retryLater()
      } else if (e instanceof SignedOut) {
        signedOut = true
      }
      emit()
    }
  }

  async function syncNow(): Promise<void> {
    if (!key) return
    if (busy) {
      again = true
      return
    }
    if (!isOnline()) {
      reachable = false
      emit()
      return
    }
    busy = true
    emit()
    try {
      do {
        again = false
        await push()
        if (reachable && !signedOut) await pull()
      } while (again && reachable && !signedOut)
    } finally {
      busy = false
      emit()
    }
  }

  // The browser's own signals: a connection back, the app back on screen, and a slow
  // heartbeat for changes made on other phones.
  if (timers && typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      failures = 0
      void syncNow()
    })
    window.addEventListener('offline', () => {
      reachable = false
      emit()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void syncNow()
    })
    setInterval(() => {
      if (document.visibilityState === 'visible') void syncNow()
    }, 2 * 60 * 1000)
    // The service worker says when the browser thinks the connection is back.
    navigator.serviceWorker?.addEventListener('message', (e) => {
      if ((e.data as { type?: string } | null)?.type === 'mandi-sync') void syncNow()
    })
  }

  const find = (op: string) => queue.find((q) => q.op === op)

  const sync: SyncControl = {
    state() {
      if (!snapshot) {
        const live = isOnline() && reachable
        snapshot = {
          online: live,
          syncing: busy,
          queue: [...queue],
          waiting: queue.filter((q) => q.state === 'waiting').length,
          problems: queue.filter((q) => q.state !== 'waiting'),
          signedOut,
          lastSync: pulledAt,
        }
      }
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    syncNow,
    async keepMine(op) {
      const q = find(op)
      if (!q) return
      q.force = true
      q.state = 'waiting'
      q.problem = undefined
      await persist()
      emit()
      await syncNow()
    },
    async drop(op) {
      const q = find(op)
      if (!q) return
      // Every later change to the same record was built on this one: they go too.
      const k = recordKey(q)
      const from = queue.indexOf(q)
      queue = queue.filter((x, i) => i < from || recordKey(x) !== k)
      rebase()
      await persist()
      emit(true)
      await syncNow()
    },
    async retry(op) {
      const q = find(op)
      if (!q) return
      q.state = 'waiting'
      q.problem = undefined
      await persist()
      emit()
      await syncNow()
    },
  }

  return {
    demo: false,
    sync,

    session: () => auth.session(),
    onAuthChange: (listener) => auth.onAuthChange(listener),
    signIn: (email, password) => auth.signIn(email, password),
    async signOut() {
      // What is waiting stays on the phone, under this login, for its next sign-in.
      await writing
      await auth.signOut()
      key = null
      server = null
      queue = []
      book = emptyBook()
      emit(true)
    },

    async load() {
      await ensure()
      if (!server) {
        // First time on this phone: the books have to come from the server once.
        if (isOnline()) await pull()
        if (!server) {
          throw new Error(
            isOnline()
              ? t("Can't reach the server. Check the internet connection and try again.")
              : t('No internet, and this phone has no copy of the books yet. Connect once to fetch them.'),
          )
        }
      } else if (!started) {
        void syncNow()
      }
      started = true
      return structuredClone(book)
    },

    async saveChallan(input) {
      return { id: input.id, number: (await make({ entity: 'challan', action: 'save', id: input.id, data: input }))! }
    },
    async deleteChallan(id) {
      await make({ entity: 'challan', action: 'delete', id })
    },
    async saveSale(input) {
      return { id: input.id, number: (await make({ entity: 'sale', action: 'save', id: input.id, data: input }))! }
    },
    async deleteSale(id) {
      await make({ entity: 'sale', action: 'delete', id })
    },
    async saveDeath(input) {
      await make({ entity: 'death', action: 'save', id: input.id, data: input })
    },
    async deleteDeath(id) {
      await make({ entity: 'death', action: 'delete', id })
    },
    async savePayment(input) {
      await make({ entity: 'payment', action: 'save', id: input.id, data: input })
    },
    async deletePayment(id) {
      await make({ entity: 'payment', action: 'delete', id })
    },
    async saveExpense(input) {
      await make({ entity: 'expense', action: 'save', id: input.id, data: input })
    },
    async deleteExpense(id) {
      await make({ entity: 'expense', action: 'delete', id })
    },
    async saveParty(kind, input) {
      await make({ entity: kind, action: 'save', id: input.id, data: input })
    },
    async deleteParty(kind, id) {
      await make({ entity: kind, action: 'delete', id })
    },
    async saveSettings(settings) {
      await make({ entity: 'settings', action: 'save', id: 'settings', data: settings })
    },
  }
}

/** A change in a few words, for the list of what is waiting: "Sale #13 · Bilal Meat Shop · Rs 64,000". */
export function describe(before: Book, after: Book, change: Change): string {
  const b = change.action === 'delete' ? before : after
  const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ')
  let what: string
  switch (change.entity) {
    case 'challan': {
      const c = b.challans.find((x) => x.id === change.id)
      const supplier = b.suppliers.find((s) => s.id === c?.supplier_id)?.name
      what = join(t('Challan #{n}', { n: c?.number ?? '' }), supplier)
      break
    }
    case 'sale': {
      const s = b.sales.find((x) => x.id === change.id)
      const customer = s?.customer_id ? b.customers.find((p) => p.id === s.customer_id)?.name : t('Walk-in customer')
      const total = b.saleLines.filter((l) => l.sale_id === change.id).reduce((sum, l) => sum + l.amount, 0)
      what = join(t('Sale #{n}', { n: s?.number ?? '' }), customer, total ? rs(total) : null)
      break
    }
    case 'death': {
      const d = b.deaths.find((x) => x.id === change.id)
      const line = b.challanLines.find((l) => l.id === d?.challan_line_id)
      what = join(t('Death'), d && line ? `${d.head} ${line.animal}` : null)
      break
    }
    case 'payment': {
      const p = b.payments.find((x) => x.id === change.id)
      what = p ? join(paymentLabel(p.kind), rs(p.amount)) : t('Payment')
      break
    }
    case 'expense': {
      const e = b.expenses.find((x) => x.id === change.id)
      what = e ? join(e.category, rs(e.amount)) : t('Expense')
      break
    }
    case 'customer':
    case 'supplier': {
      const list = change.entity === 'customer' ? b.customers : b.suppliers
      what = list.find((p) => p.id === change.id)?.name ?? (change.entity === 'customer' ? t('Customer') : t('Supplier'))
      break
    }
    case 'settings':
      what = t('Settings')
      break
  }
  return change.action === 'delete' ? t('Deleted: {what}', { what }) : what
}
