import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { ArrowDownLeft, ArrowUpRight, ChartColumn, Hourglass, PawPrint, TrendingDown, TrendingUp } from 'lucide-react'
import { Avatar, Badge, Gate, IconBadge, StockBar } from '../components/ui'
import { useBooks } from '../data/queries'
import { monthlyReport } from '../lib/books'
import { count, daysBetween, monthLabel, rs, shortDate, todayISO } from '../lib/format'
import { t } from '../lib/i18n'

/**
 * What the owner wants on opening the app, in three cards to read, not to tap: the month;
 * the khata both ways, with who owes the most; and the animals still to sell, with the lot
 * that has waited longest. Every section has its own tab for the details.
 */
export default function Home() {
  const { view, error } = useBooks()
  const today = todayISO()
  const month = useMemo(
    () => (view ? monthlyReport(view.book, view.stats).find((m) => m.month === today.slice(0, 7)) : undefined),
    [view, today],
  )
  if (!view) return <Gate error={error} ready={false} />

  const { balances, challans, book } = view

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
  // Everything those lots started with, and what became of it.
  const lotHead = inStock.reduce((sum, c) => sum + c.head, 0)
  const lotSold = inStock.reduce((sum, c) => sum + c.sold, 0)
  const lotDied = inStock.reduce((sum, c) => sum + c.died, 0)
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
    <div className="space-y-4">
      <div className="px-1 text-sm text-ink-soft">
        {t('Today')} · {shortDate(today)}
      </div>

      {/* On a big screen the month and the stock sit side by side, with the khata across under them. */}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {/* The month: what is left after everything, then what came in and what went out. */}
        <div className="card flex flex-col overflow-hidden">
          <div className="p-4 sm:p-5">
            <span className="flex min-w-0 items-center gap-2.5">
              <IconBadge icon={ChartColumn} tone="bank" size="sm" />
              <span className="truncate text-sm font-medium text-ink-soft">{monthLabel(today.slice(0, 7))}</span>
            </span>
            <div className="tnum mt-3 text-3xl leading-tight font-semibold tracking-tight">{rs(Math.abs(profit))}</div>
            {month ? (
              <div className={`mt-1 flex items-center gap-1 text-sm font-semibold ${loss ? 'text-bad' : 'text-good'}`}>
                {loss ? <TrendingDown className="h-4 w-4" aria-hidden /> : <TrendingUp className="h-4 w-4" aria-hidden />}
                {loss ? t('Loss this month') : t('Profit this month')}
              </div>
            ) : (
              <div className="mt-1 text-sm text-ink-soft">{t('Nothing yet this month')}</div>
            )}
          </div>
          <div className="mt-auto grid grid-cols-2 divide-x divide-line-soft border-t border-line-soft">
            <Part
              label={t('Sales')}
              value={rs(month?.sales ?? 0)}
              detail={count(month?.headSold ?? 0, t('animal'), t('animals'))}
            />
            <Part
              label={t('Expenses')}
              value={rs(month?.expenses ?? 0)}
              detail={
                month?.byCategory[0] ? t('Most on {category}', { category: month.byCategory[0].category }) : t('None')
              }
            />
          </div>
        </div>

        {/* The khata both ways, how they weigh against each other, and the one to chase first. */}
        <div className="card flex flex-col overflow-hidden sm:order-last sm:col-span-2">
          <div className="grid grid-cols-2 divide-x divide-line-soft">
            <Side
              icon={<IconBadge icon={ArrowDownLeft} tone="good" size="sm" />}
              label={t('Customers owe you')}
              value={rs(balances.receivable)}
              detail={count(owing, t('customer'), t('customers'))}
            />
            <Side
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
              leading={<Avatar name={topCustomer.name} />}
              label={t('Owes you the most')}
              title={topCustomer.name}
              right={rs(topOwes)}
            />
          ) : null}
        </div>

        {/* The animals still to sell, by kind, and the lot that has waited longest: it eats fodder every day. */}
        <div className="card flex flex-col overflow-hidden">
          <div className="p-4 sm:p-5">
            <span className="flex items-center gap-2.5">
              <IconBadge icon={PawPrint} tone="brand" size="sm" />
              <span className="text-sm font-medium text-ink-soft">{t('Animals in stock')}</span>
            </span>
            {/* What is left of the lots still selling, out of all they started with. */}
            <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="tnum text-3xl leading-tight font-semibold tracking-tight">{stockHead}</span>
              <span className="text-sm text-ink-soft">
                {stockHead ? t('of {n}', { n: lotHead }) : t('No animals in stock')}
              </span>
            </div>
            {stockHead ? (
              <>
                <div className="mt-3">
                  <StockBar head={lotHead} sold={lotSold} died={lotDied} />
                </div>
                <div className="mt-2 text-xs text-ink-soft">
                  {[
                    t('{n} sold', { n: lotSold }),
                    lotDied ? t('{n} died', { n: lotDied }) : null,
                    t('Cost {amount}', { amount: rs(stockCost) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </>
            ) : null}
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
          </div>
          {oldest ? (
            <Footer
              leading={<IconBadge icon={Hourglass} tone="owed" />}
              label={t('Oldest stock')}
              title={[t('Challan #{n}', { n: oldest.challan.number }), oldest.supplier?.name].filter(Boolean).join(' · ')}
              right={waited > 0 ? count(waited, t('day'), t('days')) : t('Today')}
              rightSub={t('{n} left', { n: oldest.left })}
            />
          ) : null}
        </div>
      </div>
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

/** One half of a card's bottom row. */
function Part({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 px-4 py-3 sm:px-5">
      <div className="text-xs font-medium text-ink-soft">{label}</div>
      <div className="tnum mt-1 text-lg leading-tight font-semibold">{value}</div>
      <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-ink-soft">{detail}</div>
    </div>
  )
}

/** One side of the khata: its picture and name, the amount, and how many people. */
function Side({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="flex min-w-0 flex-col p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        {icon}
        <span className="min-w-0 pt-0.5 text-[13px] leading-snug font-medium text-ink-soft">{label}</span>
      </div>
      {/* Both halves end level, however their names wrap. */}
      <div className="mt-auto pt-3">
        <div className="tnum text-xl leading-tight font-semibold tracking-tight sm:text-2xl">{value}</div>
        <div className="mt-1 text-xs text-ink-soft">{detail}</div>
      </div>
    </div>
  )
}

/** The line at the foot of a card for the one record worth knowing about now. */
function Footer({
  leading,
  label,
  title,
  right,
  rightSub,
}: {
  leading: ReactNode
  label: string
  title: string
  right: string
  rightSub?: string
}) {
  return (
    <div className="mt-auto flex items-center gap-3 border-t border-line-soft px-4 py-3 sm:px-5">
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-ink-soft">{label}</span>
        <span className="line-clamp-2 leading-snug font-medium break-words">{title}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tnum block font-semibold">{right}</span>
        {rightSub ? <span className="block text-xs text-ink-soft">{rightSub}</span> : null}
      </span>
    </div>
  )
}
