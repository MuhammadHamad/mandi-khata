import { useMemo } from 'react'
import { ArrowDownLeft, ArrowUpRight, Banknote, ChartColumn, Landmark, PawPrint, Wallet } from 'lucide-react'
import { Gain, Gate, MoneyCard, Stat } from '../components/ui'
import { useBooks } from '../data/queries'
import { monthlyReport } from '../lib/books'
import { count, monthLabel, rs, shortDate, todayISO } from '../lib/format'
import { t } from '../lib/i18n'

export default function Home() {
  const { view, error } = useBooks()
  const today = todayISO()
  const month = useMemo(
    () => (view ? monthlyReport(view.book, view.stats).find((m) => m.month === today.slice(0, 7)) : undefined),
    [view, today],
  )
  if (!view) return <Gate error={error} ready={false} />

  const { balances, money, challans } = view
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

      {/* The same card as Cash & bank: all the money first, then where it sits. */}
      <MoneyCard
        to="/money"
        label={t('Combined balance')}
        icon={Wallet}
        value={money.cash + money.bank}
        parts={[
          { label: t('Cash in hand'), value: money.cash, icon: Banknote },
          { label: t('Cash in bank'), value: money.bank, icon: Landmark },
        ]}
      />

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
          to="/reports"
        />
      </div>
    </div>
  )
}

