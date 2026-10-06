import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Card, Empty, Gain, Gate, PageHeader } from '../components/ui'
import { useBooks } from '../data/queries'
import { monthlyReport } from '../lib/books'
import type { MonthRow } from '../lib/books'
import { count, monthLabel, rs } from '../lib/format'
import { t } from '../lib/i18n'

export default function Report() {
  const { view, error } = useBooks()
  const months = useMemo(() => (view ? monthlyReport(view.book, view.stats) : []), [view])
  if (!view) return <Gate error={error} ready={false} />

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Monthly report')}
        subtitle={t(
          "An animal's cost counts in the month it is sold or dies, so a month with a big purchase doesn't show as a loss.",
        )}
      />
      {months.length === 0 ? (
        <div className="card">
          <Empty title={t('Nothing to report yet')} />
        </div>
      ) : (
        months.map((m) => <Month key={m.month} m={m} />)
      )}
    </div>
  )
}

function Month({ m }: { m: MonthRow }) {
  const animals = (n: number) => count(n, t('animal'), t('animals'))
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">{monthLabel(m.month)}</h2>
        <Gain value={m.profit} />
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <Line
          label={t('Sales')}
          note={t('{animals} · {received} paid at sale, {credit} on credit', {
            animals: animals(m.headSold),
            received: rs(m.received),
            credit: rs(m.credit),
          })}
          value={rs(m.sales)}
        />
        <Line label={t('Cost of the animals sold')} value={`− ${rs(m.costOfSold)}`} />
        {m.headDied ? (
          <Line
            label={t('Animals that died ({n})', { n: m.headDied })}
            note={t('What they cost')}
            value={`− ${rs(m.deathLoss)}`}
          />
        ) : null}
        <Line
          label={t('Expenses')}
          note={m.byCategory.map((c) => `${c.category} ${rs(c.amount)}`).join(' · ') || undefined}
          value={`− ${rs(m.expenses)}`}
        />
        <div className="border-t border-line-soft pt-2">
          <Line label={m.profit < -0.5 ? t('Loss') : t('Profit')} value={rs(Math.abs(m.profit))} strong />
        </div>
      </dl>
      {m.headDamaged || m.headBought ? (
        <div className="mt-3 space-y-1 rounded-xl bg-sunk/60 px-3 py-2.5 text-xs text-ink-soft">
          {m.headDamaged ? (
            <p>
              {t('{animals} sold {amount} below cost. That is already inside the figures above.', {
                animals: count(m.headDamaged, t('damaged animal'), t('damaged animals')),
                amount: rs(m.damagedLoss),
              })}
            </p>
          ) : null}
          {m.headBought ? (
            <p>
              {t('Bought {animals} for {amount} this month. Their cost counts as they are sold.', {
                animals: animals(m.headBought),
                amount: rs(m.bought),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

function Line({ label, note, value, strong = false }: { label: string; note?: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <dt className={strong ? 'font-semibold' : ''}>{label}</dt>
        {note ? <dd className="text-xs text-ink-soft">{note}</dd> : null}
      </div>
      <dd className={`tnum shrink-0 ${strong ? 'text-base font-semibold' : ''}`}>{value}</dd>
    </div>
  )
}
