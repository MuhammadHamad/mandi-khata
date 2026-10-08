import { useMemo } from 'react'
import { ArrowDownLeft, ArrowUpRight, ChartColumn, Hourglass, PawPrint, Receipt, Tag, UserRound } from 'lucide-react'
import { Gain, Gate, Stat } from '../components/ui'
import { useBooks } from '../data/queries'
import { monthlyReport } from '../lib/books'
import { count, dayLabel, daysBetween, monthLabel, rs, shortDate, todayISO } from '../lib/format'
import { t } from '../lib/i18n'

/**
 * What the owner wants on opening the app: how today and the month are going, what is
 * owed each way, the animals still to sell, and the two things most worth acting on:
 * the lot that has waited longest, and who owes the most.
 */
export default function Home() {
  const { view, error } = useBooks()
  const today = todayISO()
  const month = useMemo(
    () => (view ? monthlyReport(view.book, view.stats).find((m) => m.month === today.slice(0, 7)) : undefined),
    [view, today],
  )
  if (!view) return <Gate error={error} ready={false} />

  const { balances, challans, sales, book } = view
  const inStock = challans.filter((c) => c.left > 0)
  const stockHead = inStock.reduce((sum, c) => sum + c.left, 0)
  const stockCost = inStock.reduce((sum, c) => sum + c.stockCost, 0)
  const owing = [...balances.customers.values()].filter((b) => b > 0.5).length
  const owed = [...balances.suppliers.values()].filter((b) => b > 0.5).length
  const profit = month?.profit ?? 0

  const todays = sales.filter((s) => s.sale.sold_on === today)
  const todayTotal = todays.reduce((sum, s) => sum + s.total, 0)
  const todayHead = todays.reduce((sum, s) => sum + s.head, 0)
  const todayCredit = todays.reduce((sum, s) => sum + s.credit, 0)
  // Sales come newest first.
  const lastSale = sales[0]?.sale.sold_on

  const topCategory = month?.byCategory[0]

  const [topId, topOwes] = [...balances.customers].reduce<[string | null, number]>(
    (best, [id, balance]) => (balance > best[1] ? [id, balance] : best),
    [null, 0.5],
  )
  const topCustomer = topId ? book.customers.find((c) => c.id === topId) : undefined

  const oldest = inStock.reduce<(typeof inStock)[number] | undefined>(
    (o, c) => (!o || c.challan.bought_on < o.challan.bought_on ? c : o),
    undefined,
  )
  const waited = oldest ? daysBetween(oldest.challan.bought_on, today) : 0

  return (
    <div className="space-y-5">
      <div className="px-1 text-sm text-ink-soft">
        {t('Today')} · {shortDate(today)}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={Tag}
          tone="brand"
          label={t('Sales today')}
          value={rs(todayTotal)}
          detail={
            todays.length
              ? [
                  count(todayHead, t('animal'), t('animals')),
                  todayCredit > 0.5 ? t('{amount} on credit', { amount: rs(todayCredit) }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : lastSale
                ? t('Last sale {day}', { day: dayLabel(lastSale, today) })
                : t('No sales yet')
          }
          to="/sales"
        />
        <Stat
          icon={ChartColumn}
          tone="bank"
          label={monthLabel(today.slice(0, 7))}
          value={rs(Math.abs(profit))}
          status={month ? <Gain value={profit} amount={false} /> : undefined}
          detail={month ? t('Sales {amount}', { amount: rs(month.sales) }) : t('Nothing yet this month')}
          to="/reports"
        />
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
        {/* Animals that wait eat fodder every day: the lot bought longest ago is the one to sell. */}
        <Stat
          icon={Hourglass}
          tone="neutral"
          label={t('Oldest stock')}
          value={oldest ? (waited > 0 ? count(waited, t('day'), t('days')) : t('Today')) : '—'}
          detail={
            oldest
              ? `${t('Challan #{n}', { n: oldest.challan.number })} · ${t('{n} left', { n: oldest.left })}`
              : t('No animals in stock')
          }
          to={oldest ? `/challans/${oldest.challan.id}` : '/challans'}
        />
        <Stat
          icon={Receipt}
          tone="owed"
          label={t('Expenses this month')}
          value={rs(month?.expenses ?? 0)}
          detail={topCategory ? t('Most on {category}', { category: topCategory.category }) : t('None')}
          to="/expenses"
        />
        {/* The khata worth opening first: a WhatsApp reminder is one tap away there. */}
        <Stat
          icon={UserRound}
          tone="good"
          label={t('Owes you the most')}
          value={topCustomer ? rs(topOwes) : '—'}
          detail={topCustomer ? topCustomer.name : t('Nobody owes you')}
          to={topCustomer ? `/customers/${topCustomer.id}` : '/ledgers'}
        />
      </div>
    </div>
  )
}
