import { addDays, monthLabel, shortDate } from './format'

/** A stretch of days to look at: a calendar month, quarter, half-year or year, or any two dates. */
export type PeriodKind = 'month' | 'quarter' | 'half' | 'year' | 'custom'
export type Period = { kind: PeriodKind; from: string; to: string }

const MONTHS_IN = { month: 1, quarter: 3, half: 6, year: 12 } as const

const pad = (n: number) => String(n).padStart(2, '0')
/** The last day of a month, where `month` runs 1 to 12. */
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** The calendar period of one kind that holds a day: quarters are Jan–Mar and so on, halves Jan–Jun and Jul–Dec. */
export function periodAround(kind: Exclude<PeriodKind, 'custom'>, day: string): Period {
  const size = MONTHS_IN[kind]
  const year = Number(day.slice(0, 4))
  const first = Math.floor((Number(day.slice(5, 7)) - 1) / size) * size + 1
  const last = first + size - 1
  return { kind, from: `${year}-${pad(first)}-01`, to: `${year}-${pad(last)}-${pad(lastDay(year, last))}` }
}

/** The period of the same kind just before (-1) or just after (+1). Two chosen dates stay as they are. */
export function stepPeriod(p: Period, step: 1 | -1): Period {
  if (p.kind === 'custom') return p
  return periodAround(p.kind, step < 0 ? addDays(p.from, -1) : addDays(p.to, 1))
}

const SHORT_MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })
const shortMonth = (iso: string) => SHORT_MONTH.format(new Date(`${iso}T00:00:00Z`))

/** "October 2026", "Jul–Sept 2026", "2026", or the two chosen dates. */
export function periodLabel(p: Period): string {
  switch (p.kind) {
    case 'month':
      return monthLabel(p.from.slice(0, 7))
    case 'year':
      return p.from.slice(0, 4)
    case 'quarter':
    case 'half':
      return `${shortMonth(p.from)}–${shortMonth(p.to)} ${p.from.slice(0, 4)}`
    case 'custom':
      return `${shortDate(p.from)} – ${shortDate(p.to)}`
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The period kept in a page's address, so it survives opening a record and coming back.
 * `period` names the kind (monthly when missing), `at` is a day inside a calendar period
 * (today when missing), and `from` / `to` are the two chosen dates.
 */
export function readPeriod(params: URLSearchParams, today: string): Period {
  const day = (key: string) => {
    const v = params.get(key)
    return v && ISO_DAY.test(v) ? v : null
  }
  const kind = params.get('period')
  if (kind === 'custom') {
    const from = day('from') ?? periodAround('month', today).from
    const to = day('to') ?? today
    return from <= to ? { kind, from, to } : { kind, from: to, to: from }
  }
  const calendar = kind === 'quarter' || kind === 'half' || kind === 'year' ? kind : 'month'
  return periodAround(calendar, day('at') ?? today)
}

/** Writes a period into a page's address, leaving its other settings alone. The current calendar period needs nothing. */
export function writePeriod(params: URLSearchParams, p: Period, today: string): URLSearchParams {
  const next = new URLSearchParams(params)
  for (const key of ['period', 'at', 'from', 'to']) next.delete(key)
  if (p.kind === 'custom') {
    next.set('period', 'custom')
    next.set('from', p.from)
    next.set('to', p.to)
    return next
  }
  if (p.kind !== 'month') next.set('period', p.kind)
  if (today < p.from || today > p.to) next.set('at', p.from)
  return next
}
