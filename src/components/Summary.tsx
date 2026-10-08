import type { ReactNode } from 'react'
import { Card } from './ui'

/**
 * A page's figures for the period chosen above it: what it all adds up to in large type,
 * then what that is made of. Side by side on a big screen, one under the other on a phone.
 */
export function SummaryCard({
  label,
  total,
  sub,
  extra,
  children,
}: {
  label: string
  total: string
  sub?: ReactNode
  extra?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] sm:gap-8">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink-soft">{label}</div>
          <div className="tnum mt-1 text-3xl leading-tight font-semibold tracking-tight">{total}</div>
          {sub ? <div className="mt-1 text-sm text-ink-soft">{sub}</div> : null}
          {extra ? <div className="mt-3">{extra}</div> : null}
        </div>
        <dl className="mt-4 space-y-3 border-t border-line pt-4 text-sm sm:mt-0 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-8">
          {children}
        </dl>
      </div>
    </Card>
  )
}

const TONE = { good: 'text-good', bad: 'text-bad', owed: 'text-owed' } as const

/** One figure in a summary: its name, with a note under it if needed, and the amount on the right. */
export function SummaryLine({
  label,
  note,
  value,
  tone,
}: {
  label: ReactNode
  note?: ReactNode
  value: ReactNode
  tone?: keyof typeof TONE
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <dt className="font-medium">{label}</dt>
        {note ? <dd className="mt-0.5 text-xs leading-snug text-ink-soft">{note}</dd> : null}
      </div>
      <dd className={`tnum shrink-0 font-semibold ${tone ? TONE[tone] : ''}`}>{value}</dd>
    </div>
  )
}
