import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge, Empty, Gate, PageHeader, Pills, Row, Section } from '../components/ui'
import { useBooks } from '../data/queries'
import { saleAnimals } from '../lib/books'
import { accountName, count, dayLabel, rs, runsOf, todayISO } from '../lib/format'
import { t } from '../lib/i18n'

type Show = 'all' | 'credit' | 'damaged'

export default function Sales() {
  const { view, error } = useBooks()
  const [show, setShow] = useState<Show>('all')
  if (!view) return <Gate error={error} ready={false} />

  const today = todayISO()
  const month = today.slice(0, 7)
  const thisMonth = view.sales.filter((s) => s.sale.sold_on.startsWith(month))
  const list = view.sales.filter((s) => (show === 'credit' ? s.credit > 0.5 : show === 'damaged' ? s.damaged : true))

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Sales')}
        subtitle={t('This month: {amount} from {animals}', {
          amount: rs(thisMonth.reduce((sum, s) => sum + s.total, 0)),
          animals: count(
            thisMonth.reduce((sum, s) => sum + s.head, 0),
            t('animal'),
            t('animals'),
          ),
        })}
        actions={
          <Link to="/sales/new" className="btn-primary">
            <Plus className="h-4 w-4" aria-hidden />
            {t('New sale')}
          </Link>
        }
      />
      <Pills
        label={t('Which sales')}
        value={show}
        onChange={setShow}
        className="max-w-md"
        options={[
          { value: 'all', label: t('All') },
          { value: 'credit', label: t('On credit') },
          { value: 'damaged', label: t('Damaged') },
        ]}
      />
      {list.length === 0 ? (
        <div className="card">
          <Empty title={view.sales.length ? t('No sales match') : t('No sales yet')}>
            {view.sales.length ? null : t('Record one with New sale.')}
          </Empty>
        </div>
      ) : (
        runsOf(list, (s) => s.sale.sold_on).map((day) => (
          <Section
            key={day.key}
            title={dayLabel(day.key, today)}
            aside={<span className="tnum">{rs(day.rows.reduce((sum, s) => sum + s.total, 0))}</span>}
          >
            {day.rows.map((s) => (
              <Row
                key={s.sale.id}
                to={`/sales/${s.sale.id}`}
                title={`#${s.sale.number} · ${s.customer?.name ?? t('Walk-in customer')}`}
                sub={
                  <span className="flex items-center gap-2">
                    <span className="truncate">{saleAnimals(s)}</span>
                    {s.damaged ? <Badge tone="bad">{t('Damaged')}</Badge> : null}
                  </span>
                }
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
    </div>
  )
}
