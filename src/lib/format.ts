import { lang, t } from './i18n'

/** In Roman Urdu, amounts group the way traders count them: 12,50,000. In English: 1,250,000. */
function grouped(n: number): string {
  return n.toLocaleString(lang() === 'ur' ? 'en-IN' : 'en-PK')
}

/** All money in this app is Pakistani rupees, shown to the whole rupee. */
export function rs(value: number | null | undefined): string {
  const n = Math.round(Number(value ?? 0))
  if (!Number.isFinite(n)) return 'Rs 0'
  const sign = n < 0 ? '-' : ''
  return `${sign}Rs ${grouped(Math.abs(n))}`
}

/** An amount without "Rs" or sign, for a ledger column whose heading already says which way the money went. */
export function figure(value: number): string {
  const n = Math.round(Math.abs(Number(value)))
  return Number.isFinite(n) ? grouped(n) : '0'
}

/** An amount the way traders say it: "1.25 crore", "12.5 lakh", "52 hazar". Null below a thousand. */
export function inWords(value: number): string | null {
  const n = Math.abs(value)
  const trim = (x: number) => x.toLocaleString('en-PK', { maximumFractionDigits: 2 })
  if (n >= 10_000_000) return `${trim(value / 10_000_000)} crore`
  if (n >= 100_000) return `${trim(value / 100_000)} lakh`
  if (n >= 1_000) return t('{n} thousand', { n: trim(value / 1_000) })
  return null
}

/** Reads a typed amount or count; commas and spaces are ignored. NaN when it is not a number. */
export function toNumber(text: string): number {
  const cleaned = text.replace(/[,\s]/g, '')
  if (cleaned === '') return NaN
  return Number(cleaned)
}

/** A number for an input box: no grouping, and no trailing ".00". */
export function plain(n: number): string {
  if (!Number.isFinite(n)) return ''
  return String(Math.round(n * 100) / 100)
}

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const DAY_MONTH_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const MONTH_FMT = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_UR = ['Itwaar', 'Peer', 'Mangal', 'Budh', 'Jumeraat', 'Jumma', 'Hafta']

/** `2026-10-06` -> `6 Oct 2026`, without dragging the date through a timezone. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? iso : DATE_FMT.format(d)
}

/** "Today", "Yesterday", else `Mon 5 Oct` (`Peer 5 Oct` in Roman Urdu). */
export function dayLabel(iso: string, today: string): string {
  if (iso === today) return t('Today')
  if (iso === addDays(today, -1)) return t('Yesterday')
  const d = new Date(`${iso}T00:00:00Z`)
  const days = lang() === 'ur' ? WEEKDAYS_UR : WEEKDAYS_EN
  return `${days[d.getUTCDay()]} ${DAY_MONTH_FMT.format(d)}`
}

/** `2026-10` -> `October 2026`. Pakistan uses these month names in Urdu as well. */
export function monthLabel(key: string): string {
  const d = new Date(`${key}-01T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? key : MONTH_FMT.format(d)
}

/** Today on this phone's own calendar, as `YYYY-MM-DD`. */
export function todayISO(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** "1 animal", "12 animals". Pass the words through t() first: `count(n, t('animal'), t('animals'))`. */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "25 Goat · 10 Sheep" */
export function animalsText(lines: { animal: string; head: number }[]): string {
  return lines.map((l) => `${l.head} ${l.animal}`).join(' · ')
}

/** Rows already in order, as runs that share a key: a day, a month. */
export function runsOf<T>(rows: T[], keyOf: (row: T) => string): { key: string; rows: T[] }[] {
  const runs: { key: string; rows: T[] }[] = []
  for (const row of rows) {
    const key = keyOf(row)
    const last = runs[runs.length - 1]
    if (last && last.key === key) last.rows.push(row)
    else runs.push({ key, rows: [row] })
  }
  return runs
}

export function accountName(account: 'cash' | 'bank'): string {
  return account === 'cash' ? t('Cash') : t('Bank')
}
