import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Tag } from 'lucide-react'
import { PeriodPicker } from '../components/PeriodPicker'
import { SummaryCard, SummaryLine } from '../components/Summary'
import { Avatar, Badge, Empty, Gate, IconBadge, PageHeader, Pills, Row, Section } from '../components/ui'
import { useBooks } from '../data/queries'
import { periodReport, saleAnimals } from '../lib/books'
import type { ReportRow, SaleView } from '../lib/books'
import { accountName, count, dayLabel, rs, runsOf, todayISO } from '../lib/format'
import { t } from '../lib/i18n'
import { readPeriod, writePeriod } from '../lib/period'

type Show = 'paid' | 'credit' | 'damaged'

export default function Sales() {
  const { view, error } = useBooks()
  const [params, setParams] = useSearchParams()
  const [show, setShow] = useState<Show>('paid')
  const today = todayISO()
  const period = readPeriod(params, today)
  const report = useMemo(
    () => (view ? periodReport(view.book, view.stats, period.from, period.to) : null),
    [view, period.from, period.to],
  )
  if (!view || !report) return <Gate error={error} ready={false} />

  const inPeriod = view.sales.filter((s) => s.sale.sold_on >= period.from && s.sale.sold_on <= period.to)
  const list = inPeriod.filter((s) => (show === 'paid' ? s.credit <= 0.5 : show === 'credit' ? s.credit > 0.5 : s.damaged))
  // Sales come newest first, so the last one is the first ever made.
  const earliest = view.sales[view.sales.length - 1]?.sale.sold_on ?? null

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('Sales')}
        actions={
          <Link to="/sales/new" className="btn-primary">
            <Plus className="h-4 w-4" aria-hidden />
            {t('New sale')}
          </Link>
        }
      />
      {view.sales.length === 0 ? (
        <div className="card">
          <Empty icon={Tag} title={t('No sales yet')}>
            {t('Record one with New sale.')}
          </Empty>
        </div>
      ) : (
        <>
          <PeriodPicker
            period={period}
            today={today}
            earliest={earliest}
            onChange={(p) => setParams((prev) => writePeriod(prev, p, today), { replace: true })}
          />
          <SalesSummary report={report} sales={inPeriod} />
          <Pills
            label={t('Which sales')}
            value={show}
            onChange={setShow}
            className="sm:max-w-md"
            options={[
              { value: 'paid', label: t('Paid') },
              { value: 'credit', label: t('On credit') },
              { value: 'damaged', label: t('Damaged') },
            ]}
          />
          {list.length === 0 ? (
            <div className="card">
              <Empty icon={Tag} title={inPeriod.length ? t('No sales match') : t('Nothing in this period')} />
            </div>
          ) : (
            runsOf(list, (s) => s.sale.sold_on).map((day) => (
              <Section
                key={day.key}
                title={dayLabel(day.key, today)}
                aside={<span className="tnum font-medium">{rs(day.rows.reduce((sum, s) => sum + s.total, 0))}</span>}
              >
                {day.rows.map((s) => (
                  <Row
                    key={s.sale.id}
                    to={`/sales/${s.sale.id}`}
                    leading={s.customer ? <Avatar name={s.customer.name} /> : <IconBadge icon={Tag} />}
                    title={s.customer?.name ?? t('Walk-in customer')}
                    sub={`#${s.sale.number} · ${saleAnimals(s)}`}
                    below={s.damaged ? <Badge tone="bad">{t('Damaged')}</Badge> : undefined}
                    right={rs(s.total)}
                    rightSub={
                      s.credit > 0.5 ? (
                        <Badge tone="owed">{t('{amount} on credit', { amount: rs(s.credit) })}</Badge>
                      ) : (
                        accountName(s.sale.received_in)
                      )
                    }
                  />
                ))}
              </Section>
            ))
          )}
        </>
      )}
    </div>
  )
}

/**
 * The period's sales in one card: what they came to and which animals went, then how the
 * money came in and what the animals made over their cost. Expenses are left to Reports.
 */
function SalesSummary({ report: r, sales }: { report: ReportRow; sales: SaleView[] }) {
  const kinds = new Map<string, number>()
  for (const s of sales) {
    for (const l of s.lines) {
      const animal = l.stats?.line.animal ?? t('animals')
      kinds.set(animal, (kinds.get(animal) ?? 0) + l.line.head)
    }
  }
  const overCost = r.sales - r.costOfSold
  const loss = overCost < -0.5

  return (
    <SummaryCard
      label={t('Total sales')}
      total={rs(r.sales)}
      sub={`${count(r.headSold, t('animal'), t('animals'))} · ${count(sales.length, t('sale'), t('sales'))}`}
      extra={
        kinds.size ? (
          <div className="flex flex-wrap gap-1.5">
            {[...kinds]
              .sort((a, b) => b[1] - a[1])
              .map(([animal, head]) => (
                <Badge key={animal}>
                  {head} {animal}
                </Badge>
              ))}
          </div>
        ) : undefined
      }
    >
      <SummaryLine label={t('Paid at sale')} value={rs(r.received)} />
      <SummaryLine label={t('On credit')} value={rs(r.credit)} tone={r.credit > 0.5 ? 'owed' : undefined} />
      <SummaryLine
        label={loss ? t('Loss under cost') : t('Profit over cost')}
        note={t('Before expenses')}
        value={rs(Math.abs(overCost))}
        tone={loss ? 'bad' : 'good'}
      />
      {r.headDamaged ? (
        <SummaryLine
          label={t('Damaged animals ({n})', { n: r.headDamaged })}
          note={t('Sold this much below their cost')}
          value={rs(r.damagedLoss)}
          tone="bad"
        />
      ) : null}
    </SummaryCard>
  )
}
