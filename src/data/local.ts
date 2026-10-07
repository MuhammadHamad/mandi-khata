/**
 * The copy of the books kept on the phone for working offline: the server's
 * copy as last fetched, and the changes made here that the server has not
 * confirmed yet. Both are written together in one go, so a phone switched off
 * mid-save never keeps one without the other.
 */
import type { Book } from '../lib/types'
import type { Change } from './changes'

/** A change made on this phone, waiting for the server. */
export type Queued = Change & {
  /** The change's own id: the server does each change once, however often it is sent. */
  op: string
  /** The record's version in the server's copy when this phone first changed it; null for a new one. */
  base: number | null
  /** An earlier change to the same record, sent but not yet confirmed. */
  after: string | null
  /** Tried at least once, so it may already be on the server. */
  sent: boolean
  /** Sent with the owner's say-so to replace another phone's copy. */
  force?: boolean
  /** waiting: will be sent; conflict: changed on another phone too; failed: the server refused it. */
  state: 'waiting' | 'conflict' | 'failed'
  /** Why it failed, in words. */
  problem?: string
  /**
   * The trouble was found on this phone, not by the server: the change no longer fits
   * the books here (its customer was refused, say). It waits again by itself once it fits.
   */
  local?: boolean
  /** When it was made, and what it is, for the list of waiting changes. */
  at: string
  label: string
}

export type Saved = {
  server: Book | null
  queue: Queued[]
  /** When the server's copy was last fetched. */
  pulledAt: string | null
}

export type LocalStore = {
  read(key: string): Promise<Saved | null>
  write(key: string, saved: Saved): Promise<void>
}

/** For the checks, and for browsers without IndexedDB (the copy then lasts one visit). */
export function memoryLocal(): LocalStore {
  const kept = new Map<string, string>()
  return {
    read: async (key) => {
      const raw = kept.get(key)
      return raw ? (JSON.parse(raw) as Saved) : null
    },
    write: async (key, saved) => void kept.set(key, JSON.stringify(saved)),
  }
}

const DB = 'mandi-khata'
const STORE = 'books'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'))
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'))
  })
}

/** IndexedDB, which browsers keep far more reliably than localStorage and with room for years of records. */
export function indexedLocal(): LocalStore {
  let db: Promise<IDBDatabase> | null = null
  const ready = () => (db ??= openDb())
  const run = async <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
    const conn = await ready()
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = conn.transaction(STORE, mode, { durability: 'strict' })
      const req = work(tx.objectStore(STORE))
      // Resolved only once the transaction is committed to disk.
      tx.oncomplete = () => resolve(req ? req.result : undefined)
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB'))
    })
  }
  return {
    read: async (key) => ((await run<Saved>('readonly', (s) => s.get(key) as IDBRequest<Saved>)) ?? null),
    write: async (key, saved) => {
      await run('readwrite', (s) => void s.put(saved, key))
    },
  }
}

/** IndexedDB where there is one; otherwise memory, with the risk said in Settings. */
export function phoneLocal(): LocalStore {
  return typeof indexedDB === 'undefined' ? memoryLocal() : indexedLocal()
}
