import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Truck } from 'lucide-react'
import { Empty, Gate, NumberBadge, PageHeader, Pills, Row, Section, StockBar, gainParts } from '../components/ui'
import { useBooks } from '../data/queries'
import { animalsText, shortDate } from '../lib/format'
import { t } from '../lib/i18n'

type Show = 'stock' | 'sold' | 'all'

export default function Challans() {
  const { view, error } = useBooks()
  const [show, setShow] = useState<Show>('stock')
  if (!view) return <Gate error={error} ready={false} />

  const inStock = view.challans.filter((c) => !c.closed)
  const soldOut = view.challans.filter((c) => c.closed)
  const list = show === 'stock' ? inStock : show === 'sold' ? soldOut : view.challans

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('Challans')}
        subtitle={t('{open} with animals in stock · {sold} sold out', { open: inStock.length, sold: soldOut.length })}
        actions={
          <Link to="/challans/new" className="btn-primary">
            <Plus className="h-4 w-4" aria-hidden />
            {t('New challan')}
          </Link>
        }
      />
      <Pills
        label={t('Which challans')}
        value={show}
        onChange={setShow}
        className="sm:max-w-md"
        options={[
          { value: 'stock', label: t('In stock') },
          { value: 'sold', label: t('Sold out') },
          { value: 'all', label: t('All') },
        ]}
      />
      <Section>
        {list.length === 0 ? (
          <Empty icon={Truck} title={show === 'sold' ? t('No challan is sold out yet') : t('No challans here')}>
            {view.challans.length === 0 ? t('Record your first purchase with New challan.') : null}
          </Empty>
        ) : (
          list.map((c) => (
            <Row
              key={c.challan.id}
              to={`/challans/${c.challan.id}`}
              leading={<NumberBadge n={c.challan.number} />}
              title={c.supplier?.name ?? t('Supplier')}
              sub={`${shortDate(c.challan.bought_on)} · ${animalsText(c.lines.map((s) => s.line))} · ${
                c.closed ? t('sold out') : t('{n} left', { n: c.left })
              }`}
              below={
                <div className="max-w-56">
                  <StockBar head={c.head} sold={c.sold} died={c.died} />
                </div>
              }
              {...gainParts(c.profit, !c.closed)}
            />
          ))
        )}
      </Section>
    </div>
  )
}
