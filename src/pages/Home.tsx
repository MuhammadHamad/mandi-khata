import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChartColumn,
  ChevronRight,
  Hourglass,
  PawPrint,
  Tag,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { Avatar, Badge, Gate, IconBadge } from '../components/ui'
import { useBooks } from '../data/queries'
import { monthlyReport } from '../lib/books'
import { addDays, count, dayLabel, daysBetween, monthLabel, rs, shortDate, todayISO } from '../lib/format'
import { t } from '../lib/i18n'

/**
 * What the owner wants on opening the app, in four places: today, in the green card with
 * the week behind it; the month; the khata both ways, with who owes the most; and the
 * animals still to sell, with the lot that has waited longest.
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

  // Today, and the six days before it.
  const byDay = new Map<string, number>()
  for (const s of sales) byDay.set(s.sale.sold_on, (byDay.get(s.sale.sold_on) ?? 0) + s.total)
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6)
    return { day, total: byDay.get(day) ?? 0 }
  })
  const todays = sales.filter((s) => s.sale.sold_on === today)
  const todayHead = todays.reduce((sum, s) => sum + s.head, 0)
  const todayCredit = todays.reduce((sum, s) => sum + s.credit, 0)
  // Sales come newest first.
  const lastSale = sales[0]?.sale.sold_on

  const profit = month?.profit ?? 0
  const loss = profit < -0.5

  const owing = [...balances.customers.values()].filter((b) => b > 0.5).length
  const owed = [...balances.suppliers.values()].filter((b) => b > 0.5).length
  const net = balances.receivable - balances.payable
  const [topId, topOwes] = [...balances.customers].reduce<[string | null, number]>(
    (best, [id, balance]) => (balance > best[1] ? [id, balance] : best),
    [null, 0.5],
  )
  const topCustomer = topId ? book.customers.find((c) => c.id === topId) : undefined

  const inStock = challans.filter((c) => c.left > 0)
  const stockHead = inStock.reduce((sum, c) => sum + c.left, 0)
  const stockCost = inStock.reduce((sum, c) => sum + c.stockCost, 0)
  const kinds = new Map<string, number>()
  for (const c of inStock) {
    for (const l of c.lines) if (l.left > 0) kinds.set(l.line.animal, (kinds.get(l.line.animal) ?? 0) + l.left)
  }
  const oldest = inStock.reduce<(typeof inStock)[number] | undefined>(
    (o, c) => (!o || c.challan.bought_on < o.challan.bought_on ? c : o),
    undefined,
  )
  const waited = oldest ? daysBetween(oldest.challan.bought_on, today) : 0

  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      {/* Today: the one figure that changes every day, with the week behind it. */}
      <Link
        to="/sales"
        className="block rounded-[1.5rem] bg-hero p-5 text-white shadow-lg shadow-hero/25 transition active:scale-[0.99]"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-white/80">
            <Tag className="h-4 w-4" aria-hidden />
            {t('Sales today')}
          </span>
          <span className="text-xs font-medium text-white/65">{shortDate(today)}</span>
        </div>
        <div className="tnum mt-2 text-[2.5rem] leading-none font-semibold tracking-tight">
          {rs(todays.reduce((sum, s) => sum + s.total, 0))}
        </div>
        <div className="mt-2 text-sm text-white/75">
          {todays.length
            ? `${count(todayHead, t('animal'), t('animals'))} · ${
                todayCredit > 0.5 ? t('{amount} on credit', { amount: rs(todayCredit) }) : t('Paid')
              }`
            : lastSale
              ? t('Last sale {day}', { day: dayLabel(lastSale, today) })
              : t('No sales yet')}
        </div>
        <WeekBars week={week} today={today} />
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/15 pt-3 text-xs text-white/70">
          <span>{t('Last 7 days')}</span>
          <span className="tnum font-semibold text-white">{rs(week.reduce((sum, d) => sum + d.total, 0))}</span>
        </div>
      </Link>

      {/* The month: what is left after everything, then what came in and what went out. */}
      <div className="card flex flex-col overflow-hidden">
        <Link to="/reports" className="block p-4 transition hover:bg-sunk/40 active:bg-sunk/70 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <IconBadge icon={ChartColumn} tone="bank" size="sm" />
              <span className="truncate text-sm font-medium text-ink-soft">{monthLabel(today.slice(0, 7))}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
          </div>
          <div className="tnum mt-3 text-3xl leading-tight font-semibold tracking-tight">{rs(Math.abs(profit))}</div>
          {month ? (
            <div className={`mt-1 flex items-center gap-1 text-sm font-semibold ${loss ? 'text-bad' : 'text-good'}`}>
              {loss ? <TrendingDown className="h-4 w-4" aria-hidden /> : <TrendingUp className="h-4 w-4" aria-hidden />}
              {loss ? t('Loss this month') : t('Profit this month')}
            </div>
          ) : (
            <div className="mt-1 text-sm text-ink-soft">{t('Nothing yet this month')}</div>
          )}
        </Link>
        <div className="mt-auto grid grid-cols-2 divide-x divide-line-soft border-t border-line-soft">
          <Part
            to="/sales"
            label={t('Sales')}
            value={rs(month?.sales ?? 0)}
            detail={count(month?.headSold ?? 0, t('animal'), t('animals'))}
          />
          <Part
            to="/expenses"
            label={t('Expenses')}
            value={rs(month?.expenses ?? 0)}
            detail={month?.byCategory[0] ? t('Most on {category}', { category: month.byCategory[0].category }) : t('None')}
          />
        </div>
      </div>

      {/* The khata both ways, how they weigh against each other, and the one to chase first. */}
      <div className="card flex flex-col overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-line-soft">
          <Side
            to="/ledgers"
            icon={<IconBadge icon={ArrowDownLeft} tone="good" size="sm" />}
            label={t('Customers owe you')}
            value={rs(balances.receivable)}
            detail={count(owing, t('customer'), t('customers'))}
          />
          <Side
            to="/ledgers?tab=suppliers"
            icon={<IconBadge icon={ArrowUpRight} tone="owed" size="sm" />}
            label={t('You owe suppliers')}
            value={rs(balances.payable)}
            detail={count(owed, t('supplier'), t('suppliers'))}
          />
        </div>
        <div className="px-4 pb-4 sm:px-5">
          <Weigh lend={balances.receivable} owe={balances.payable} />
          <div className="mt-2 text-xs text-ink-soft">
            {Math.abs(net) < 0.5
              ? t('All square')
              : net > 0
                ? t('Overall, {amount} is owed to you', { amount: rs(net) })
                : t('Overall, you owe {amount}', { amount: rs(-net) })}
          </div>
        </div>
        {topCustomer ? (
          <Footer
            to={`/customers/${topCustomer.id}`}
            leading={<Avatar name={topCustomer.name} />}
            label={t('Owes you the most')}
            title={topCustomer.name}
            right={rs(topOwes)}
          />
        ) : null}
      </div>

      {/* The animals still to sell, by kind, and the lot that has waited longest: it eats fodder every day. */}
      <div className="card flex flex-col overflow-hidden">
        <Link to="/challans" className="block p-4 transition hover:bg-sunk/40 active:bg-sunk/70 sm:p-5">
          <span className="flex items-center gap-2.5">
            <IconBadge icon={PawPrint} tone="brand" size="sm" />
            <span className="text-sm font-medium text-ink-soft">{t('Animals in stock')}</span>
          </span>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="tnum text-3xl leading-tight font-semibold tracking-tight">{stockHead}</span>
            <span className="text-sm text-ink-soft">
              {stockHead ? t('Cost {amount}', { amount: rs(stockCost) }) : t('No animals in stock')}
            </span>
          </div>
          {kinds.size ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[...kinds]
                .sort((a, b) => b[1] - a[1])
                .map(([animal, head]) => (
                  <Badge key={animal}>
                    {head} {animal}
                  </Badge>
                ))}
            </div>
          ) : null}
        </Link>
        {oldest ? (
          <Footer
            to={`/challans/${oldest.challan.id}`}
            leading={<IconBadge icon={Hourglass} tone="owed" />}
            label={t('Oldest stock')}
            title={[t('Challan #{n}', { n: oldest.challan.number }), oldest.supplier?.name].filter(Boolean).join(' · ')}
            right={waited > 0 ? count(waited, t('day'), t('days')) : t('Today')}
            rightSub={t('{n} left', { n: oldest.left })}
          />
        ) : null}
      </div>
    </div>
  )
}

/**
 * Sales on each of the last seven days as bars on the green card, today's in full white.
 * A day without sales keeps a small stub, so the week always reads as seven days.
 */
function WeekBars({ week, today }: { week: { day: string; total: number }[]; today: string }) {
  const most = Math.max(...week.map((d) => d.total))
  return (
    <div className="mt-5 grid grid-cols-7 gap-1.5" role="img" aria-label={t('Sales on each of the last 7 days')}>
      {week.map(({ day, total }) => {
        const isToday = day === today
        return (
          <div key={day} className="flex flex-col items-center gap-1.5" title={`${dayLabel(day, today)}: ${rs(total)}`}>
            <div className="flex h-14 w-full items-end justify-center">
              <div
                className={`w-full max-w-6 rounded-t-md rounded-b-sm ${isToday ? 'bg-white' : total ? 'bg-white/40' : 'bg-white/15'}`}
                style={{ height: total && most ? `${Math.max(8, (total / most) * 100)}%` : '3px' }}
              />
            </div>
            <span className={`text-[11px] leading-none ${isToday ? 'font-semibold text-white' : 'text-white/60'}`}>
              {isToday ? t('Today') : Number(day.slice(8, 10))}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Owed to the business against owed by it, as one bar: green for what comes in, amber for what goes out. */
function Weigh({ lend, owe }: { lend: number; owe: number }) {
  const all = lend + owe
  if (all < 0.5) return <div className="h-2 rounded-full bg-sunk" aria-hidden />
  return (
    <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
      {lend > 0.5 ? <span className="rounded-full bg-good" style={{ width: `${(lend / all) * 100}%` }} /> : null}
      {owe > 0.5 ? <span className="rounded-full bg-owed" style={{ width: `${(owe / all) * 100}%` }} /> : null}
    </div>
  )
}

/** One half of a card's bottom row: a figure that opens its own page. */
function Part({ to, label, value, detail }: { to: string; label: string; value: string; detail: string }) {
  return (
    <Link to={to} className="block min-w-0 px-4 py-3 transition hover:bg-sunk/40 active:bg-sunk/70 sm:px-5">
      <div className="text-xs font-medium text-ink-soft">{label}</div>
      <div className="tnum mt-1 text-lg leading-tight font-semibold">{value}</div>
      <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-ink-soft">{detail}</div>
    </Link>
  )
}

/** One side of the khata: its picture and name, the amount, and how many people. */
function Side({
  to,
  icon,
  label,
  value,
  detail,
}: {
  to: string
  icon: ReactNode
  label: string
  value: string
  detail: string
}) {
  return (
    <Link to={to} className="flex min-w-0 flex-col p-4 transition hover:bg-sunk/40 active:bg-sunk/70 sm:p-5">
      <div className="flex items-start gap-2.5">
        {icon}
        <span className="min-w-0 pt-0.5 text-[13px] leading-snug font-medium text-ink-soft">{label}</span>
      </div>
      {/* Both halves end level, however their names wrap. */}
      <div className="mt-auto pt-3">
        <div className="tnum text-xl leading-tight font-semibold tracking-tight sm:text-2xl">{value}</div>
        <div className="mt-1 text-xs text-ink-soft">{detail}</div>
      </div>
    </Link>
  )
}

/** The line at the foot of a card for the one record worth opening now. */
function Footer({
  to,
  leading,
  label,
  title,
  right,
  rightSub,
}: {
  to: string
  leading: ReactNode
  label: string
  title: string
  right: string
  rightSub?: string
}) {
  return (
    <Link
      to={to}
      className="mt-auto flex items-center gap-3 border-t border-line-soft px-4 py-3 transition hover:bg-sunk/40 active:bg-sunk/70 sm:px-5"
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-ink-soft">{label}</span>
        <span className="line-clamp-2 leading-snug font-medium break-words">{title}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tnum block font-semibold">{right}</span>
        {rightSub ? <span className="block text-xs text-ink-soft">{rightSub}</span> : null}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
    </Link>
  )
}
