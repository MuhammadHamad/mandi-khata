import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, HeartCrack, Receipt, Tag, Truck } from 'lucide-react'
import { DeathForm, ExpenseForm, PaymentForm } from '../components/forms'
import { Badge, Empty, Gain, Gate, PageHeader, Row, Section, Tile, gainParts } from '../components/ui'
import { useBooks } from '../data/queries'
import { monthlyReport, saleAnimals } from '../lib/books'
import { count, dayLabel, monthLabel, rs, shortDate, todayISO } from '../lib/format'
import { t } from '../lib/i18n'

export default function Home() {
  const { view, error } = useBooks()
  const [open, setOpen] = useState<'death' | 'payment' | 'expense' | null>(null)
  const today = todayISO()
  const month = useMemo(
    () => (view ? monthlyReport(view.book, view.stats).find((m) => m.month === today.slice(0, 7)) : undefined),
    [view, today],
  )
  if (!view) return <Gate error={error} ready={false} />

  const { balances, money, challans, sales } = view
  const inStock = challans.filter((c) => c.left > 0)
  const stockHead = inStock.reduce((sum, c) => sum + c.left, 0)
  const stockCost = inStock.reduce((sum, c) => sum + c.stockCost, 0)
  const owing = [...balances.customers.values()].filter((b) => b > 0.5).length
  const owed = [...balances.suppliers.values()].filter((b) => b > 0.5).length
  const profit = month?.profit ?? 0

  return (
    <div className="space-y-6">
      <PageHeader title={t('Overview')} subtitle={shortDate(today)} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Link to="/sales/new" className="btn-primary col-span-2 py-3 sm:col-span-1">
          <Tag className="h-4 w-4" aria-hidden />
          {t('New sale')}
        </Link>
        <Link to="/challans/new" className="btn-ghost py-3">
          <Truck className="h-4 w-4" aria-hidden />
          {t('New challan')}
        </Link>
        <button type="button" className="btn-ghost py-3" onClick={() => setOpen('death')}>
          <HeartCrack className="h-4 w-4" aria-hidden />
          {t('Death')}
        </button>
        <button type="button" className="btn-ghost py-3" onClick={() => setOpen('payment')}>
          <ArrowLeftRight className="h-4 w-4" aria-hidden />
          {t('Payment')}
        </button>
        <button type="button" className="btn-ghost py-3" onClick={() => setOpen('expense')}>
          <Receipt className="h-4 w-4" aria-hidden />
          {t('Expense')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile label={t('Cash in hand')} value={rs(money.cash)} to="/money" />
        <Tile label={t('Bank')} value={rs(money.bank)} to="/money?book=bank" />
        <Tile
          label={t('Customers owe you')}
          value={rs(balances.receivable)}
          detail={count(owing, t('customer'), t('customers'))}
          to="/ledgers"
        />
        <Tile
          label={t('You owe suppliers')}
          value={rs(balances.payable)}
          detail={count(owed, t('supplier'), t('suppliers'))}
          to="/ledgers?tab=suppliers"
        />
        <Tile
          label={t('Animals in stock')}
          value={`${stockHead}`}
          detail={stockHead ? t('Cost {amount}', { amount: rs(stockCost) }) : t('None')}
          to="/challans"
        />
        <Tile
          label={monthLabel(today.slice(0, 7))}
          value={rs(Math.abs(profit))}
          status={month ? <Gain value={profit} amount={false} /> : undefined}
          detail={month ? t('Sales {amount}', { amount: rs(month.sales) }) : t('Nothing yet this month')}
          to="/report"
        />
      </div>

      <Section
        title={t('Animals in stock')}
        aside={
          <Link to="/challans" className="font-medium text-brand-deep">
            {t('All challans')}
          </Link>
        }
      >
        {inStock.length === 0 ? (
          <Empty title={t('No animals in stock')}>{t('Record a challan when you buy a lot of animals.')}</Empty>
        ) : (
          inStock.map((c) => (
            <Row
              key={c.challan.id}
              to={`/challans/${c.challan.id}`}
              title={`#${c.challan.number} · ${c.supplier?.name ?? t('Supplier')}`}
              sub={t('{animals} left · bought {date}', {
                animals: c.lines
                  .filter((s) => s.left > 0)
                  .map((s) => `${s.left} ${s.line.animal}`)
                  .join(', '),
                date: shortDate(c.challan.bought_on),
              })}
              {...gainParts(c.profit, true)}
            />
          ))
        )}
      </Section>

      <Section
        title={t('Latest sales')}
        aside={
          <Link to="/sales" className="font-medium text-brand-deep">
            {t('All sales')}
          </Link>
        }
      >
        {sales.length === 0 ? (
          <Empty title={t('No sales yet')} />
        ) : (
          sales.slice(0, 5).map((s) => (
            <Row
              key={s.sale.id}
              to={`/sales/${s.sale.id}`}
              title={`#${s.sale.number} · ${s.customer?.name ?? t('Walk-in customer')}`}
              sub={`${dayLabel(s.sale.sold_on, today)} · ${saleAnimals(s)}`}
              right={rs(s.total)}
              rightSub={
                s.credit > 0.5 ? (
                  <Badge tone="owed">{t('{amount} on credit', { amount: rs(s.credit) })}</Badge>
                ) : (
                  t('Paid')
                )
              }
            />
          ))
        )}
      </Section>

      <DeathForm open={open === 'death'} onClose={() => setOpen(null)} />
      <PaymentForm open={open === 'payment'} onClose={() => setOpen(null)} />
      <ExpenseForm open={open === 'expense'} onClose={() => setOpen(null)} />
    </div>
  )
}
