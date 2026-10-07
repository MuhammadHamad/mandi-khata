/**
 * The real backend: a Supabase project set up with supabase/setup.sql, worked
 * offline first (synced.ts). Reads fetch every table whole and the app works
 * out its figures from them (src/lib/books.ts). Every change goes through one
 * database function, apply_change, which saves a record and its lines
 * together or not at all, once only, and hands back conflicts.
 */
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { t } from '../lib/i18n'
import type { Book } from '../lib/types'
import type { User } from './api'
import type { Change } from './changes'
import { phoneLocal } from './local'
import { TABLES, toBook } from './rows'
import { wire } from './wire'
import { SignedOut, Unreachable, createSyncedBackend } from './synced'
import type { Auth, Remote } from './synced'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const liveConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

function db(): SupabaseClient {
  if (!client) {
    if (!url || !anonKey) throw new Error(t('The app is not connected to its database yet. See README.md.'))
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
      // A mandi's connection can hang rather than fail: give up after 25 seconds and try later.
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal ?? (typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(25_000) : undefined),
          }),
      },
    })
  }
  return client
}

type DbError = { code?: string; message?: string } | null

/** The database's refusals, in words staff can act on. `known` says what a code means for this action. */
function friendly(error: DbError, known: Record<string, string> = {}): Error {
  const code = error?.code ?? ''
  const message = error?.message ?? ''
  if (known[code]) return new Error(known[code])
  // The checks in setup.sql already speak plainly, in English; the ones the
  // dictionary knows come out in Roman Urdu too.
  if (code === 'P0001') return new Error(t(message))
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST303') {
    return new Error(t('You have been signed out. Please sign in again.'))
  }
  if (code === '23505') return new Error(t('That is already saved.'))
  if (code === '23503') return new Error(t('Other records still use this, so it cannot be changed or deleted.'))
  if (/failed to fetch|network|load failed/i.test(message)) {
    return new Error(t("Can't reach the server. Check the internet connection and try again."))
  }
  return new Error(message || t('Something went wrong. Please try again.'))
}

const userOf = (email: string | undefined): User => ({ email: email ?? '' })

/**
 * A whole table, page by page. The first page asks for the row count, so a
 * project whose API returns fewer rows per page than asked is still read to
 * the end.
 */
async function all(table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let total = Infinity
  while (rows.length < total) {
    const first = rows.length === 0
    const { data, error, count } = await db()
      .from(table)
      .select('*', first ? { count: 'exact' } : undefined)
      .order('id')
      .range(rows.length, rows.length + 999)
    if (error) throw friendly(error)
    if (first) total = count ?? 0
    if (!data || data.length === 0) break
    rows.push(...(data as Record<string, unknown>[]))
  }
  return rows
}

/** No connection, a timeout, or the server not answering: try again later, nothing is wrong with the change. */
function unreachable(error: { message?: string; name?: string; code?: string } | null): boolean {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`
  return /failed to fetch|network|load failed|fetch failed|timed? ?out|timeout|aborted|offline|ECONN|503|502|504/i.test(text)
}

function signedOut(error: { code?: string; message?: string } | null): boolean {
  return ['42501', 'PGRST301', 'PGRST303'].includes(error?.code ?? '') || /jwt expired|invalid jwt|not authenticated/i.test(error?.message ?? '')
}

/** What a refusal means for this change, in words staff can act on. */
function refusal(change: Change, error: DbError): Error {
  const known: Record<string, string> = {}
  if (change.entity === 'challan') {
    if (change.action === 'delete') known['23503'] = t('This challan has sales, deaths or expenses. Delete those first.')
    else {
      known['23503'] = t('An animal you took off this challan already has sales or deaths. Put it back first.')
      known['23505'] = t('Each kind of animal can be on one line only.')
    }
  }
  if (change.entity === 'customer' || change.entity === 'supplier') {
    const customer = change.entity === 'customer'
    if (change.action === 'delete') {
      known['23503'] = customer
        ? t("This customer has records, so they can't be deleted.")
        : t("This supplier has records, so they can't be deleted.")
    } else {
      known['23505'] = customer ? t('There is already a customer with that name.') : t('There is already a supplier with that name.')
    }
  }
  return friendly(error, known)
}

export const liveRemote: Remote = {
  async pull(): Promise<Book> {
    try {
      const [settings, ...tables] = await Promise.all([
        db().from('settings').select('*').maybeSingle(),
        ...TABLES.map((t) => all(t)),
      ])
      if (settings.error) throw settings.error
      const rows = Object.fromEntries(TABLES.map((t, i) => [t, tables[i]])) as Parameters<typeof toBook>[1]
      return toBook(settings.data as Record<string, unknown> | null, rows)
    } catch (e) {
      const error = e as { code?: string; message?: string; name?: string }
      if (unreachable(error)) throw new Unreachable(error.message)
      if (signedOut(error)) throw new SignedOut(t('You have been signed out. Please sign in again.'))
      throw e instanceof Error ? e : friendly(error)
    }
  },

  async push(q) {
    let data: unknown
    let error: (DbError & { name?: string }) | null
    try {
      ;({ data, error } = await db().rpc('apply_change', { p: wire(q) }))
    } catch (e) {
      throw new Unreachable((e as Error).message)
    }
    if (error) {
      if (unreachable(error)) throw new Unreachable(error.message ?? '')
      if (signedOut(error)) throw new SignedOut(t('You have been signed out. Please sign in again.'))
      throw refusal(q, error)
    }
    const result = data as { status: 'ok' | 'conflict'; number?: number | null }
    return result.status === 'conflict' ? { status: 'conflict' } : { status: 'ok', number: result.number ?? null }
  },
}

/** Who last signed in on this phone, so the app still opens on its copy when the sign-in can't be renewed offline. */
const LAST_USER = 'mandi-app:last-user'
const remember = (email: string | undefined) => {
  try {
    if (email) localStorage.setItem(LAST_USER, email)
  } catch {
    // Private window: the phone's copy simply needs a connection to open.
  }
}
const remembered = (): User | null => {
  try {
    const email = localStorage.getItem(LAST_USER)
    return email ? userOf(email) : null
  } catch {
    return null
  }
}

export const liveAuth: Auth = {
  async session() {
    try {
      const { data, error } = await db().auth.getSession()
      if (data.session) {
        remember(data.session.user.email)
        return userOf(data.session.user.email)
      }
      // Signed in, but the sign-in can't be renewed without a connection: open the phone's copy.
      if (error && unreachable(error)) return remembered()
      return null
    } catch (e) {
      if (unreachable(e as Error)) return remembered()
      throw e
    }
  },

  onAuthChange(listener) {
    const { data } = db().auth.onAuthStateChange((_event, session) => {
      if (session) remember(session.user.email)
      listener(session ? userOf(session.user.email) : null)
    })
    return () => data.subscription.unsubscribe()
  },

  async signIn(email, password) {
    const { data, error } = await db().auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      throw /invalid login credentials/i.test(error.message)
        ? new Error(t('Wrong email or password.'))
        : friendly({ code: error.code, message: error.message })
    }
    remember(data.user.email)
    return userOf(data.user.email)
  },

  async signOut() {
    try {
      localStorage.removeItem(LAST_USER)
    } catch {
      // Nothing kept to forget.
    }
    await db().auth.signOut()
  },
}

/** The live app: the books on the phone, kept in step with Supabase. */
export const liveBackend = createSyncedBackend({ remote: liveRemote, auth: liveAuth, local: phoneLocal() })
