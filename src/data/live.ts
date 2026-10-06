/**
 * The real backend: a Supabase project set up with supabase/setup.sql.
 * Reads fetch every table whole and the app works out its figures from them
 * (src/lib/books.ts). Challans and sales save through database functions so
 * a record and its lines are saved together or not at all.
 */
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { t } from '../lib/i18n'
import type { PartyKind } from '../lib/types'
import { clean, tidyPayment } from './api'
import type { Backend, User } from './api'
import { TABLES, toBook } from './rows'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const liveConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

function db(): SupabaseClient {
  if (!client) {
    if (!url || !anonKey) throw new Error(t('The app is not connected to its database yet. See README.md.'))
    client = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
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

const partyTable = (kind: PartyKind) => (kind === 'customer' ? 'customers' : 'suppliers')

export const liveBackend: Backend = {
  demo: false,

  async session() {
    const { data } = await db().auth.getSession()
    return data.session ? userOf(data.session.user.email) : null
  },

  onAuthChange(listener) {
    const { data } = db().auth.onAuthStateChange((_event, session) => {
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
    return userOf(data.user.email)
  },

  async signOut() {
    await db().auth.signOut()
  },

  async load() {
    const [settings, ...tables] = await Promise.all([
      db().from('settings').select('*').maybeSingle(),
      ...TABLES.map((t) => all(t)),
    ])
    if (settings.error) throw friendly(settings.error)
    const rows = Object.fromEntries(TABLES.map((t, i) => [t, tables[i]])) as Parameters<typeof toBook>[1]
    return toBook(settings.data as Record<string, unknown> | null, rows)
  },

  async saveChallan(input) {
    const { data, error } = await db().rpc('save_challan', {
      p_challan: {
        id: input.id,
        bought_on: input.bought_on,
        supplier_id: input.supplier_id,
        paid_now: input.paid_now,
        paid_from: input.paid_from,
        notes: clean(input.notes),
      },
      p_lines: input.lines.map((l) => ({ id: l.id, animal: l.animal.trim(), head: l.head, cost: l.cost })),
    })
    if (error) {
      throw friendly(error, {
        '23503': t('An animal you took off this challan already has sales or deaths. Put it back first.'),
        '23505': t('Each kind of animal can be on one line only.'),
      })
    }
    return data as { id: string; number: number }
  },

  async deleteChallan(id) {
    const { error } = await db().from('challans').delete().eq('id', id)
    if (error) throw friendly(error, { '23503': t('This challan has sales, deaths or expenses. Delete those first.') })
  },

  async saveSale(input) {
    const { data, error } = await db().rpc('save_sale', {
      p_sale: {
        id: input.id,
        sold_on: input.sold_on,
        customer_id: input.customer_id,
        received_now: input.received_now,
        received_in: input.received_in,
        notes: clean(input.notes),
      },
      p_lines: input.lines.map((l) => ({
        id: l.id,
        challan_line_id: l.challan_line_id,
        head: l.head,
        amount: l.amount,
        damaged: l.damaged,
      })),
    })
    if (error) throw friendly(error)
    return data as { id: string; number: number }
  },

  async deleteSale(id) {
    const { error } = await db().from('sales').delete().eq('id', id)
    if (error) throw friendly(error)
  },

  async saveDeath(input) {
    const { error } = await db()
      .from('deaths')
      .upsert({ ...input, cause: clean(input.cause) })
    if (error) throw friendly(error)
  },

  async deleteDeath(id) {
    const { error } = await db().from('deaths').delete().eq('id', id)
    if (error) throw friendly(error)
  },

  async savePayment(input) {
    const { error } = await db().from('payments').upsert(tidyPayment(input))
    if (error) throw friendly(error)
  },

  async deletePayment(id) {
    const { error } = await db().from('payments').delete().eq('id', id)
    if (error) throw friendly(error)
  },

  async saveExpense(input) {
    const { error } = await db()
      .from('expenses')
      .upsert({ ...input, category: input.category.trim(), notes: clean(input.notes) })
    if (error) throw friendly(error)
  },

  async deleteExpense(id) {
    const { error } = await db().from('expenses').delete().eq('id', id)
    if (error) throw friendly(error)
  },

  async saveParty(kind, input) {
    const { error } = await db()
      .from(partyTable(kind))
      .upsert({ ...input, name: input.name.trim(), phone: clean(input.phone), notes: clean(input.notes) })
    if (error) {
      throw friendly(error, {
        '23505':
          kind === 'customer'
            ? t('There is already a customer with that name.')
            : t('There is already a supplier with that name.'),
      })
    }
  },

  async deleteParty(kind, id) {
    const { error } = await db().from(partyTable(kind)).delete().eq('id', id)
    if (error) {
      throw friendly(error, {
        '23503':
          kind === 'customer'
            ? t("This customer has records, so they can't be deleted.")
            : t("This supplier has records, so they can't be deleted."),
      })
    }
  },

  async saveSettings(settings) {
    const { data } = await db().auth.getSession()
    const owner = data.session?.user.id
    if (!owner) throw new Error(t('You have been signed out. Please sign in again.'))
    const { error } = await db()
      .from('settings')
      .upsert({ owner_id: owner, ...settings, business_name: settings.business_name.trim(), updated_at: new Date().toISOString() })
    if (error) throw friendly(error)
  },
}
