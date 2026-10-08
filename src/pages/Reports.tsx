import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChartColumn, TrendingDown, TrendingUp } from 'lucide-react'
import { PeriodPicker } from '../components/PeriodPicker'
import { SummaryLine } from '../components/Summary'
import { Badge, Card, Empty, Gate, PageHeader } from '../components/ui'
import { useBooks } from '../data/queries'
import { firstRecordDay, periodReport } from '../lib/books'
import type { ReportRow } from '../lib/books'
import { count, rs, todayISO } from '../lib/format'
import { t } from '../lib/i18n'
import { periodLabel, readPeriod, writePeriod } from '../lib/period'

export default function Reports() {
  const { view, error } = useBooks()
  const [params, setParams] = useSearchParams()
  const today = todayISO()
  const period = readPeriod(params, today)
  const report = useMemo(
    () => (view ? periodReport(view.book, view.stats, period.from, period.to) : null),
    [view, period.from, period.to],
  )
  if (!view || !report) return <Gate error={error} ready={false} />
  const earliest = firstRecordDay(view.book)
  const empty = !report.sales && !report.expenses && !report.headDied && !report.headBought

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('Reports')}
        subtitle={t("An animal's cost counts when it is sold or dies, so a big purchase doesn't show as a loss.")}
      />
      {earliest ? (
        <>
          <PeriodPicker
            period={period}
            today={today}
            earliest={earliest}
            onChange={(p) => setParams((prev) => writePeriod(prev, p, today), { replace: true })}
          />
          {empty ? (
            <div className="card">
              <Empty icon={ChartColumn} title={t('Nothing in this period')} />
            </div>
          ) : (
            <Summary title={periodLabel(period)} r={report} />
          )}
        </>
      ) : (
        <div className="card">
          <Empty icon={ChartColumn} title={t('Nothing to report yet')} />
        </div>
      )}
    </div>
  )
}

/** A period as a sum: sales, less what they cost, less deaths and expenses, is the profit. */
function Summary({ title, r }: { title: string; r: ReportRow }) {
  const animals = (n: number) => count(n, t('animal'), t('animals'))
  const loss = r.profit < -0.5
  const Icon = loss ? TrendingDown : TrendingUp
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Badge tone={loss ? 'bad' : 'good'}>
          <Icon className="mr-1 h-3.5 w-3.5" aria-hidden />
          {loss ? t('Loss') : t('Profit')}
        </Badge>
      </div>
      <dl className="mt-4 space-y-3 text-sm">
        <SummaryLine
          label={t('Sales')}
          note={t('{animals} · {received} paid at sale, {credit} on credit', {
            animals: animals(r.headSold),
            received: rs(r.received),
            credit: rs(r.credit),
          })}
          value={rs(r.sales)}
        />
        <SummaryLine label={t('Cost of the animals sold')} value={`− ${rs(r.costOfSold)}`} />
        {r.headDied ? (
          <SummaryLine
            label={t('Animals that died ({n})', { n: r.headDied })}
            note={t('What they cost')}
            value={`− ${rs(r.deathLoss)}`}
          />
        ) : null}
        <SummaryLine
          label={t('Expenses')}
          note={r.byCategory.map((c) => `${c.category} ${rs(c.amount)}`).join(' · ') || undefined}
          value={`− ${rs(r.expenses)}`}
        />
        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <dt className="font-semibold">{loss ? t('Loss') : t('Profit')}</dt>
          <dd className={`tnum text-lg font-semibold ${loss ? 'text-bad' : 'text-good'}`}>{rs(Math.abs(r.profit))}</dd>
        </div>
      </dl>
      {r.headDamaged || r.headBought ? (
        <div className="mt-4 space-y-1.5 rounded-xl bg-sunk/70 px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
          {r.headDamaged ? (
            <p>
              {t('{animals} sold {amount} below cost. That is already inside the figures above.', {
                animals: count(r.headDamaged, t('damaged animal'), t('damaged animals')),
                amount: rs(r.damagedLoss),
              })}
            </p>
          ) : null}
          {r.headBought ? (
            <p>
              {t('Bought {animals} for {amount} in this time. Their cost counts as they are sold.', {
                animals: animals(r.headBought),
                amount: rs(r.bought),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
