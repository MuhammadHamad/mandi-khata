import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { ChartColumn, TrendingDown, TrendingUp } from 'lucide-react'
import { Badge, Card, Empty, Gate, PageHeader } from '../components/ui'
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
    <div className="space-y-4">
      <PageHeader
        title={t('Monthly report')}
        subtitle={t(
          "An animal's cost counts in the month it is sold or dies, so a month with a big purchase doesn't show as a loss.",
        )}
      />
      {months.length === 0 ? (
        <div className="card">
          <Empty icon={ChartColumn} title={t('Nothing to report yet')} />
        </div>
      ) : (
        months.map((m) => <Month key={m.month} m={m} />)
      )}
    </div>
  )
}

/** A month as a sum: sales, less what they cost, less deaths and expenses, is the profit. */
function Month({ m }: { m: MonthRow }) {
  const animals = (n: number) => count(n, t('animal'), t('animals'))
  const loss = m.profit < -0.5
  const Icon = loss ? TrendingDown : TrendingUp
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{monthLabel(m.month)}</h2>
        <Badge tone={loss ? 'bad' : 'good'}>
          <Icon className="mr-1 h-3.5 w-3.5" aria-hidden />
          {loss ? t('Loss') : t('Profit')}
        </Badge>
      </div>
      <dl className="mt-4 space-y-3 text-sm">
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
        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <dt className="font-semibold">{loss ? t('Loss') : t('Profit')}</dt>
          <dd className={`tnum text-lg font-semibold ${loss ? 'text-bad' : 'text-good'}`}>{rs(Math.abs(m.profit))}</dd>
        </div>
      </dl>
      {m.headDamaged || m.headBought ? (
        <div className="mt-4 space-y-1.5 rounded-xl bg-sunk/70 px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
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

function Line({ label, note, value }: { label: string; note?: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <dt className="font-medium">{label}</dt>
        {note ? <dd className="mt-0.5 text-xs leading-snug text-ink-soft">{note}</dd> : null}
      </div>
      <dd className="tnum shrink-0 font-semibold">{value}</dd>
    </div>
  )
}
