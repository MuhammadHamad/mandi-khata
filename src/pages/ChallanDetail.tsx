import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HeartCrack, Pencil, Receipt, Tag, Trash2 } from 'lucide-react'
import { DeathForm, ExpenseForm } from '../components/forms'
import {
  Avatar,
  Badge,
  Card,
  ConfirmDialog,
  Empty,
  Gain,
  Gate,
  IconBadge,
  PageHeader,
  Row,
  Section,
  StockBar,
} from '../components/ui'
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
    <div className="space-y-5">
      <PageHeader
        back={{ to: '/challans', label: t('Challans') }}
        title={t('Challan #{n}', { n: c.challan.number })}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {supplierLink ? (
              <Link to={supplierLink} className="font-semibold text-brand-deep">
                {c.supplier?.name}
              </Link>
            ) : null}
            <span>· {t('bought {date}', { date: shortDate(c.challan.bought_on) })}</span>
          </span>
        }
        corner={
          <Link to={`/challans/${c.challan.id}/edit`} className="btn-ghost min-h-10">
            <Pencil className="h-4 w-4" aria-hidden />
            {t('Edit')}
          </Link>
        }
      />

      {/* The result, and the sum that makes it. */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-ink-soft">{c.closed ? t('Final result') : t('Result so far')}</div>
            <div className="mt-1.5 text-[2rem] leading-none font-semibold tracking-tight">{rs(Math.abs(c.profit))}</div>
            <div className="mt-2">
              <Gain value={c.profit} amount={false} />
            </div>
          </div>
          {c.closed ? <Badge>{t('Sold out')}</Badge> : <Badge tone="brand">{t('{n} in stock', { n: c.left })}</Badge>}
        </div>
        <dl className="mt-5 space-y-2 border-t border-line-soft pt-4 text-sm">
          <Line label={t('Sold for')} value={rs(c.saleValue)} />
          <Line
            label={t('Cost of the {animals} sold or dead', { animals: animals(c.sold + c.died) })}
            value={`− ${rs(c.costOfGone)}`}
          />
          <Line label={t('Expenses on this challan')} value={`− ${rs(c.expenses)}`} />
        </dl>
        {!c.closed ? (
          <p className="mt-4 rounded-xl bg-sunk/70 px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
            {t('In stock: {animals}, which cost {amount}. That cost counts once they are sold or die.', {
              animals: animals(c.left),
              amount: rs(c.stockCost),
            })}
          </p>
        ) : (
          <p className="mt-4 text-xs text-ink-soft">{t('Final: every animal is sold or dead')}</p>
        )}
      </Card>

      {/* Icon over word, so long Urdu words still fit three across a phone. */}
      <div className="grid grid-cols-3 gap-2">
        {c.closed ? (
          <span className={`btn-soft ${STACK} pointer-events-none opacity-50`}>
            <Tag className="h-5 w-5" aria-hidden />
            {t('Sold out')}
          </span>
        ) : (
          <Link to={`/sales/new?challan=${c.challan.id}`} className={`btn-primary ${STACK}`}>
            <Tag className="h-5 w-5" aria-hidden />
            {t('Sell')}
          </Link>
        )}
        <button type="button" className={`btn-soft ${STACK}`} onClick={() => setDeath('new')} disabled={c.closed}>
          <HeartCrack className="h-5 w-5" aria-hidden />
          {t('Death')}
        </button>
        <button type="button" className={`btn-soft ${STACK}`} onClick={() => setExpense('new')}>
          <Receipt className="h-5 w-5" aria-hidden />
          {t('Expense')}
        </button>
      </div>

      <Section title={t('Animals')}>
        {c.lines.map((s) => (
          <div key={s.line.id} className="px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">{s.line.animal}</span>
              <span className="tnum font-semibold">{t('{n} left', { n: s.left })}</span>
            </div>
            <div className="mt-2.5">
              <StockBar head={s.line.head} sold={s.sold} died={s.died} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-ink-soft">
              <span>{t('{n} bought', { n: s.line.head })}</span>
              <span className="text-brand-deep">
                {s.soldDamaged
                  ? t('{n} sold ({damaged} damaged)', { n: s.sold, damaged: s.soldDamaged })
                  : t('{n} sold', { n: s.sold })}
              </span>
              {s.died ? <span className="text-bad">{t('{n} died', { n: s.died })}</span> : null}
              <span>{t('{amount} each', { amount: rs(s.each) })}</span>
            </div>
          </div>
        ))}
      </Section>

      {c.deathLoss > 0 || c.damagedLoss > 0 ? (
        <div className="space-y-2 rounded-card bg-bad-wash/70 p-4 text-sm">
          <h2 className="font-semibold text-bad">{t('Losses on this challan')}</h2>
          {c.died ? <Line label={t('{n} died (what they cost)', { n: c.died })} value={rs(c.deathLoss)} /> : null}
          {c.soldDamaged ? (
            <Line label={t('{n} damaged, sold below cost by', { n: c.soldDamaged })} value={rs(c.damagedLoss)} />
          ) : null}
          <p className="text-xs text-ink-soft">{t('Already counted in the profit above.')}</p>
        </div>
      ) : null}

      <Card className="space-y-2 p-4 text-sm">
        <h2 className="mb-1 text-[15px] font-semibold">{t('Payment to the supplier')}</h2>
        <Line label={t('Challan total')} value={rs(c.cost)} />
        <Line
          label={t('Paid at purchase ({account})', { account: accountName(c.challan.paid_from) })}
          value={rs(c.challan.paid_now)}
        />
        <Line label={t('Left on credit')} value={rs(c.unpaid)} strong />
        {c.unpaid > 0.5 && supplierLink ? (
          <p className="pt-1 text-xs text-ink-soft">
            {t("The credit is on the supplier's ledger.")}{' '}
            <Link to={supplierLink} className="font-semibold text-brand-deep">
              {t("Open {name}'s ledger", { name: c.supplier?.name ?? '' })}
            </Link>
          </p>
        ) : null}
      </Card>

      <Section title={t('Sales from this challan ({n})', { n: sales.length })}>
        {sales.length === 0 ? (
          <Empty icon={Tag} title={t('Nothing sold yet')} />
        ) : (
          sales.map(({ s, mine }) => (
            <Row
              key={s.sale.id}
              to={`/sales/${s.sale.id}`}
              leading={s.customer ? <Avatar name={s.customer.name} /> : <IconBadge icon={Tag} />}
              title={s.customer?.name ?? t('Walk-in customer')}
              sub={`#${s.sale.number} · ${shortDate(s.sale.sold_on)} · ${mine
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
                leading={<IconBadge icon={HeartCrack} tone="bad" />}
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
          <Empty icon={Receipt} title={t('No expenses linked')}>
            {t('Add transport, fodder and the like with Expense above.')}
          </Empty>
        ) : (
          expenses.map((e) => (
            <Row
              key={e.id}
              onClick={() => setExpense(e)}
              leading={<IconBadge icon={Receipt} tone="owed" />}
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
          <h2 className="text-[15px] font-semibold">{t('Notes')}</h2>
          <p className="mt-1 whitespace-pre-wrap text-ink-soft">{c.challan.notes}</p>
        </Card>
      ) : null}

      <div className="pt-2">
        <button
          type="button"
          className="btn-quiet w-full text-bad hover:text-bad"
          onClick={() => {
            const why = whyCantDeleteChallan(view.book, c.challan.id)
            setBlocked(why)
            if (!why) setConfirming(true)
          }}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {t('Delete this challan')}
        </button>
        {blocked ? <p className="mt-1 text-center text-sm text-ink-soft">{blocked}</p> : null}
      </div>

      <DeathForm
        key={`death:${death === 'new' ? 'new' : (death?.id ?? 'closed')}`}
        open={death !== null}
        death={death && death !== 'new' ? death : undefined}
        lineId={firstOpen}
        onClose={() => setDeath(null)}
      />
      <ExpenseForm
        key={`expense:${expense === 'new' ? 'new' : (expense?.id ?? 'closed')}`}
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

const STACK = 'flex-col gap-1 px-2 py-3 text-center leading-tight whitespace-normal'

function Line({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'font-semibold' : 'text-ink-soft'}>{label}</dt>
      <dd className="tnum font-semibold">{value}</dd>
    </div>
  )
}
