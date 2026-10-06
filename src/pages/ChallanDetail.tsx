import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HeartCrack, Pencil, Receipt, Tag, Trash2 } from 'lucide-react'
import { DeathForm, ExpenseForm } from '../components/forms'
import { Badge, Card, ConfirmDialog, Empty, Gain, Gate, PageHeader, Row, Section, Tile } from '../components/ui'
import { backend } from '../data/backend'
import { useAction, useBooks } from '../data/queries'
import { costOf } from '../lib/books'
import { accountName, count, rs, shortDate } from '../lib/format'
import { t } from '../lib/i18n'
import { whyCantDeleteChallan } from '../lib/rules'
import type { Death, Expense } from '../lib/types'

export default function ChallanDetail() {
  const { id = '' } = useParams()
  const { view, error } = useBooks()
  const navigate = useNavigate()
  const [death, setDeath] = useState<Death | 'new' | null>(null)
  const [expense, setExpense] = useState<Expense | 'new' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [blocked, setBlocked] = useState<string | null>(null)
  const remove = useAction(backend.deleteChallan)

  if (!view) return <Gate error={error} ready={false} />
  const c = view.challanById.get(id)
  if (!c) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('Challan not found')} back={{ to: '/challans', label: t('Challans') }} />
        <p className="text-sm text-ink-soft">{t('It may have been deleted.')}</p>
      </div>
    )
  }

  const lineIds = new Set(c.lines.map((s) => s.line.id))
  const sales = view.sales
    .map((s) => ({ s, mine: s.lines.filter((l) => lineIds.has(l.line.challan_line_id)) }))
    .filter((x) => x.mine.length > 0)
  const deaths = view.book.deaths
    .filter((d) => lineIds.has(d.challan_line_id))
    .sort((a, b) => b.died_on.localeCompare(a.died_on))
  const expenses = view.book.expenses
    .filter((e) => e.challan_id === c.challan.id)
    .sort((a, b) => b.spent_on.localeCompare(a.spent_on))
  const supplierLink = c.supplier ? `/suppliers/${c.supplier.id}` : null
  const firstOpen = c.lines.find((s) => s.left > 0)?.line.id
  const animals = (n: number) => count(n, t('animal'), t('animals'))

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/challans', label: t('Challans') }}
        title={t('Challan #{n}', { n: c.challan.number })}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {supplierLink ? (
              <Link to={supplierLink} className="font-medium text-brand-deep">
                {c.supplier?.name}
              </Link>
            ) : null}
            <span>· {t('bought {date}', { date: shortDate(c.challan.bought_on) })}</span>
            {c.closed ? <Badge>{t('Sold out')}</Badge> : <Badge tone="brand">{t('{n} in stock', { n: c.left })}</Badge>}
          </span>
        }
        actions={
          <>
            <Link to={`/challans/${c.challan.id}/edit`} className="btn-ghost">
              <Pencil className="h-4 w-4" aria-hidden />
              {t('Edit')}
            </Link>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                const why = whyCantDeleteChallan(view.book, c.challan.id)
                setBlocked(why)
                if (!why) setConfirming(true)
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t('Delete')}
            </button>
          </>
        }
      />
      {blocked ? <p className="-mt-3 text-sm text-bad">{blocked}</p> : null}

      <div className="grid grid-cols-3 gap-2">
        {c.closed ? (
          <span className="btn-ghost pointer-events-none opacity-50">
            <Tag className="h-4 w-4" aria-hidden />
            {t('Sold out')}
          </span>
        ) : (
          <Link to={`/sales/new?challan=${c.challan.id}`} className="btn-primary">
            <Tag className="h-4 w-4" aria-hidden />
            {t('Sell')}
          </Link>
        )}
        <button type="button" className="btn-ghost" onClick={() => setDeath('new')} disabled={c.closed}>
          <HeartCrack className="h-4 w-4" aria-hidden />
          {t('Death')}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setExpense('new')}>
          <Receipt className="h-4 w-4" aria-hidden />
          {t('Expense')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t('Bought for')} value={rs(c.cost)} detail={animals(c.head)} />
        <Tile label={t('Sold for')} value={rs(c.saleValue)} detail={t('{n} sold', { n: c.sold })} />
        <Tile label={t('Expenses')} value={rs(c.expenses)} detail={count(expenses.length, t('expense'), t('expenses'))} />
        <Tile
          label={c.closed ? t('Final result') : t('Result so far')}
          value={rs(Math.abs(c.profit))}
          status={<Gain value={c.profit} amount={false} />}
          detail={
            c.closed ? t('Final: every animal is sold or dead') : t('{animals} still to sell', { animals: animals(c.left) })
          }
        />
      </div>

      <Card className="p-4">
        <h2 className="font-sans text-sm font-semibold text-ink-soft">{t('How it is worked out')}</h2>
        <dl className="mt-2 space-y-1.5 text-sm">
          <Line label={t('Sold for')} value={rs(c.saleValue)} />
          <Line
            label={t('Cost of the {animals} sold or dead', { animals: animals(c.sold + c.died) })}
            value={`− ${rs(c.costOfGone)}`}
          />
          <Line label={t('Expenses on this challan')} value={`− ${rs(c.expenses)}`} />
          <div className="border-t border-line-soft pt-1.5">
            <Line label={c.closed ? t('Result') : t('Result so far')} value={<Gain value={c.profit} />} strong />
          </div>
        </dl>
        {!c.closed ? (
          <p className="mt-2 text-xs text-ink-soft">
            {t('In stock: {animals}, which cost {amount}. That cost counts once they are sold or die.', {
              animals: animals(c.left),
              amount: rs(c.stockCost),
            })}
          </p>
        ) : null}
      </Card>

      <Section title={t('Animals')}>
        {c.lines.map((s) => (
          <Row
            key={s.line.id}
            title={s.line.animal}
            sub={[
              t('{n} bought', { n: s.line.head }),
              s.soldDamaged
                ? t('{n} sold ({damaged} damaged)', { n: s.sold, damaged: s.soldDamaged })
                : t('{n} sold', { n: s.sold }),
              s.died ? t('{n} died', { n: s.died }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            right={t('{n} left', { n: s.left })}
            rightSub={t('{amount} each', { amount: rs(s.each) })}
          />
        ))}
      </Section>

      {c.deathLoss > 0 || c.damagedLoss > 0 ? (
        <Card className="space-y-1.5 border-bad/25 bg-bad-wash/40 p-4 text-sm">
          <h2 className="font-sans text-sm font-semibold text-bad">{t('Losses on this challan')}</h2>
          {c.died ? <Line label={t('{n} died (what they cost)', { n: c.died })} value={rs(c.deathLoss)} /> : null}
          {c.soldDamaged ? (
            <Line label={t('{n} damaged, sold below cost by', { n: c.soldDamaged })} value={rs(c.damagedLoss)} />
          ) : null}
          <p className="pt-1 text-xs text-ink-soft">{t('Already counted in the profit above.')}</p>
        </Card>
      ) : null}

      <Card className="space-y-1.5 p-4 text-sm">
        <h2 className="font-sans text-sm font-semibold text-ink-soft">{t('Payment to the supplier')}</h2>
        <Line
          label={t('Paid at purchase ({account})', { account: accountName(c.challan.paid_from) })}
          value={rs(c.challan.paid_now)}
        />
        <Line label={t('Left on credit')} value={rs(c.unpaid)} />
        {c.unpaid > 0.5 && supplierLink ? (
          <p className="pt-1 text-xs text-ink-soft">
            {t("The credit is on the supplier's ledger.")}{' '}
            <Link to={supplierLink} className="font-medium text-brand-deep">
              {t("Open {name}'s ledger", { name: c.supplier?.name ?? '' })}
            </Link>
          </p>
        ) : null}
      </Card>

      <Section title={t('Sales from this challan ({n})', { n: sales.length })}>
        {sales.length === 0 ? (
          <Empty title={t('Nothing sold yet')} />
        ) : (
          sales.map(({ s, mine }) => (
            <Row
              key={s.sale.id}
              to={`/sales/${s.sale.id}`}
              title={`#${s.sale.number} · ${s.customer?.name ?? t('Walk-in customer')}`}
              sub={`${shortDate(s.sale.sold_on)} · ${mine
                .map((l) => `${l.line.head} ${l.stats?.line.animal ?? ''}${l.line.damaged ? ` (${t('damaged')})` : ''}`)
                .join(', ')}`}
              right={rs(mine.reduce((sum, l) => sum + l.line.amount, 0))}
              rightSub={t('cost {amount}', {
                amount: rs(mine.reduce((sum, l) => sum + (l.stats ? costOf(l.stats.line, l.line.head) : 0), 0)),
              })}
            />
          ))
        )}
      </Section>

      {deaths.length ? (
        <Section title={t('Deaths')}>
          {deaths.map((d) => {
            const s = view.stats.get(d.challan_line_id)
            return (
              <Row
                key={d.id}
                onClick={() => setDeath(d)}
                title={`${d.head} ${s?.line.animal ?? ''}`}
                sub={[shortDate(d.died_on), d.cause].filter(Boolean).join(' · ')}
                right={s ? rs(costOf(s.line, d.head)) : ''}
                rightSub={t('cost')}
              />
            )
          })}
        </Section>
      ) : null}

      <Section title={t('Expenses on this challan')}>
        {expenses.length === 0 ? (
          <Empty title={t('No expenses linked')}>{t('Add transport, fodder and the like with Expense above.')}</Empty>
        ) : (
          expenses.map((e) => (
            <Row
              key={e.id}
              onClick={() => setExpense(e)}
              title={e.category}
              sub={[shortDate(e.spent_on), e.notes].filter(Boolean).join(' · ')}
              right={rs(e.amount)}
              rightSub={accountName(e.paid_from)}
            />
          ))
        )}
      </Section>

      {c.challan.notes ? (
        <Card className="p-4 text-sm">
          <h2 className="font-sans text-sm font-semibold text-ink-soft">{t('Notes')}</h2>
          <p className="mt-1 whitespace-pre-wrap">{c.challan.notes}</p>
        </Card>
      ) : null}

      <DeathForm
        key={death === 'new' ? 'new-death' : (death?.id ?? 'none')}
        open={death !== null}
        death={death && death !== 'new' ? death : undefined}
        lineId={firstOpen}
        onClose={() => setDeath(null)}
      />
      <ExpenseForm
        key={expense === 'new' ? 'new-expense' : (expense?.id ?? 'none')}
        open={expense !== null}
        expense={expense && expense !== 'new' ? expense : undefined}
        challanId={c.challan.id}
        onClose={() => setExpense(null)}
      />
      <ConfirmDialog
        open={confirming}
        title={t('Delete challan #{n}?', { n: c.challan.number })}
        message={t('It has no sales, deaths or expenses, so nothing else changes.')}
        busy={remove.isPending}
        error={remove.error}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(c.challan.id)
            navigate('/challans', { replace: true })
          } catch {
            // Shown in the dialog.
          }
        }}
      />
    </div>
  )
}

function Line({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'font-semibold' : 'text-ink-soft'}>{label}</dt>
      <dd className={`tnum ${strong ? 'font-semibold' : ''}`}>{value}</dd>
    </div>
  )
}
