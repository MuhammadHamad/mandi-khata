import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  ChartColumn,
  HeartCrack,
  PawPrint,
  Receipt,
  Tag,
  Truck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DeathForm, ExpenseForm, PaymentForm } from '../components/forms'
import {
  Avatar,
  Badge,
  Empty,
  Gain,
  Gate,
  IconBadge,
  MoneyCard,
  NumberBadge,
  Row,
  Section,
  Stat,
  gainParts,
} from '../components/ui'
import type { Tone } from '../components/ui'
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
    <div className="space-y-5">
      <div className="px-1 text-sm text-ink-soft">
        {t('Today')} · {shortDate(today)}
      </div>

      {/* The money in hand: the first thing an owner checks. */}
      <MoneyCard
        to="/money"
        label={t('Cash in hand')}
        icon={Banknote}
        value={money.cash}
        parts={[
          { label: t('Bank'), value: money.bank },
          { label: t('Together'), value: money.cash + money.bank },
        ]}
      />

      <div className="space-y-2">
        <Link to="/sales/new" className="btn-primary min-h-14 w-full rounded-2xl text-base">
          <Tag className="h-5 w-5" aria-hidden />
          {t('New sale')}
        </Link>
        <div className="grid grid-cols-4 gap-2">
          <Action to="/challans/new" icon={Truck} tone="bank" label={t('New challan')} />
          <Action onClick={() => setOpen('death')} icon={HeartCrack} tone="bad" label={t('Death')} />
          <Action onClick={() => setOpen('payment')} icon={ArrowLeftRight} tone="brand" label={t('Payment')} />
          <Action onClick={() => setOpen('expense')} icon={Receipt} tone="owed" label={t('Expense')} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={ArrowDownLeft}
          tone="good"
          label={t('Customers owe you')}
          value={rs(balances.receivable)}
          detail={count(owing, t('customer'), t('customers'))}
          to="/ledgers"
        />
        <Stat
          icon={ArrowUpRight}
          tone="owed"
          label={t('You owe suppliers')}
          value={rs(balances.payable)}
          detail={count(owed, t('supplier'), t('suppliers'))}
          to="/ledgers?tab=suppliers"
        />
        <Stat
          icon={PawPrint}
          tone="brand"
          label={t('Animals in stock')}
          value={`${stockHead}`}
          detail={stockHead ? t('Cost {amount}', { amount: rs(stockCost) }) : t('None')}
          to="/challans"
        />
        <Stat
          icon={ChartColumn}
          tone="bank"
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
          <Link to="/challans" className="font-semibold text-brand-deep">
            {t('All challans')}
          </Link>
        }
      >
        {inStock.length === 0 ? (
          <Empty icon={PawPrint} title={t('No animals in stock')}>
            {t('Record a challan when you buy a lot of animals.')}
          </Empty>
        ) : (
          inStock.map((c) => (
            <Row
              key={c.challan.id}
              to={`/challans/${c.challan.id}`}
              leading={<NumberBadge n={c.challan.number} />}
              title={c.supplier?.name ?? t('Supplier')}
              sub={t('{animals} left', {
                animals: c.lines
                  .filter((s) => s.left > 0)
                  .map((s) => `${s.left} ${s.line.animal}`)
                  .join(', '),
              })}
              {...gainParts(c.profit, true)}
            />
          ))
        )}
      </Section>

      <Section
        title={t('Latest sales')}
        aside={
          <Link to="/sales" className="font-semibold text-brand-deep">
            {t('All sales')}
          </Link>
        }
      >
        {sales.length === 0 ? (
          <Empty icon={Tag} title={t('No sales yet')} />
        ) : (
          sales.slice(0, 5).map((s) => (
            <Row
              key={s.sale.id}
              to={`/sales/${s.sale.id}`}
              leading={s.customer ? <Avatar name={s.customer.name} /> : <IconBadge icon={Tag} />}
              title={s.customer?.name ?? t('Walk-in customer')}
              sub={`${saleAnimals(s)} · ${dayLabel(s.sale.sold_on, today)}`}
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

/** One of the daily jobs: a big picture with its name under it. */
function Action({
  to,
  onClick,
  icon,
  tone,
  label,
}: {
  to?: string
  onClick?: () => void
  icon: LucideIcon
  tone: Tone
  label: string
}) {
  const body = (
    <>
      <IconBadge icon={icon} tone={tone} size="lg" />
      <span className="text-center text-xs leading-tight font-semibold">{label}</span>
    </>
  )
  const cls = 'card flex flex-col items-center gap-2 px-1 py-3 transition active:scale-[0.97] hover:shadow-md'
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  )
}
