import { ChevronLeft, ChevronRight } from 'lucide-react'
import { t } from '../lib/i18n'
import { periodAround, periodLabel, stepPeriod } from '../lib/period'
import type { Period, PeriodKind } from '../lib/period'

/**
 * Picks the stretch of days a page shows: a month, quarter, half-year or year, stepped with
 * the arrows, or any two dates. `earliest` is the first day with a record, so the arrows
 * stop where the records do, and never go past today.
 */
export function PeriodPicker({
  period,
  today,
  earliest,
  onChange,
}: {
  period: Period
  today: string
  earliest: string | null
  onChange: (p: Period) => void
}) {
  const kinds: { value: PeriodKind; label: string }[] = [
    { value: 'month', label: t('Monthly') },
    { value: 'quarter', label: t('Quarterly') },
    { value: 'half', label: t('Bi-annually') },
    { value: 'year', label: t('Annually') },
    { value: 'custom', label: t('Custom date range') },
  ]
  // A new kind opens on the latest stretch of the one shown before.
  const anchor = period.to < today ? period.to : today
  const choose = (kind: PeriodKind) =>
    onChange(kind === 'custom' ? { kind, from: period.from, to: anchor } : periodAround(kind, anchor))
  const canGoBack = earliest !== null && earliest < period.from
  const canGoOn = period.to < today

  return (
    <div className="flex flex-wrap items-end gap-2">
      {/* Wide enough for the calendar kinds, so the period's name beside it has room on a phone. */}
      <select
        aria-label={t('Period')}
        className={`field font-medium ${period.kind === 'custom' ? 'w-auto max-w-full' : 'w-36 shrink-0'}`}
        value={period.kind}
        onChange={(e) => choose(e.target.value as PeriodKind)}
      >
        {kinds.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>

      {period.kind === 'custom' ? (
        <div className="grid basis-full grid-cols-2 gap-2 sm:basis-auto">
          <label className="min-w-0">
            <span className="label">{t('From')}</span>
            <input
              type="date"
              className="field"
              value={period.from}
              max={today}
              onChange={(e) => {
                const from = e.target.value
                if (from) onChange({ kind: 'custom', from, to: from > period.to ? from : period.to })
              }}
            />
          </label>
          <label className="min-w-0">
            <span className="label">{t('To')}</span>
            <input
              type="date"
              className="field"
              value={period.to}
              max={today}
              onChange={(e) => {
                const to = e.target.value
                if (to) onChange({ kind: 'custom', from: to < period.from ? to : period.from, to })
              }}
            />
          </label>
        </div>
      ) : (
        <div className="flex min-h-12 min-w-0 flex-1 items-center justify-between rounded-xl border border-line bg-paper sm:max-w-72">
          <button
            type="button"
            aria-label={t('Earlier')}
            disabled={!canGoBack}
            onClick={() => onChange(stepPeriod(period, -1))}
            className="flex h-12 w-10 shrink-0 items-center justify-center rounded-l-xl text-ink-soft transition hover:text-ink disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <span className="tnum min-w-0 truncate text-center text-sm font-semibold sm:text-[15px]" aria-live="polite">
            {periodLabel(period)}
          </span>
          <button
            type="button"
            aria-label={t('Later')}
            disabled={!canGoOn}
            onClick={() => onChange(stepPeriod(period, 1))}
            className="flex h-12 w-10 shrink-0 items-center justify-center rounded-r-xl text-ink-soft transition hover:text-ink disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
