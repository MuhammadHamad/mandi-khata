import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronDown, HeartCrack, PawPrint, Pencil, Receipt, StickyNote, Tag, Trash2, Truck } from 'lucide-react'
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
  TabCards,
} from '../components/ui'
import { backend } from '../data/backend'
import { useAction, useBooks } from '../data/queries'
import { costOf } from '../lib/books'
import type { ChallanSummary, Derived, SaleView } from '../lib/books'
import { accountName, count, rs, shortDate } from '../lib/format'
import { t } from '../lib/i18n'
import { whyCantDeleteChallan } from '../lib/rules'
import type { Death, Expense } from '../lib/types'

/** The four parts of a challan's details; one shows at a time, under the cards that pick it. */
type Part = 'animals' | 'sales' | 'expenses' | 'supplier'
const PARTS: readonly Part[] = ['animals', 'sales', 'expenses', 'supplier']

export default function ChallanDetail() {
  const { id = '' } = useParams()
  const { view, error } = useBooks()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
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
  // Kept in the address, so coming back from a sale opens the same part. A sold-out challan opens on its sales.
  const first: Part = c.closed ? 'sales' : 'animals'
  const asked = params.get('tab') as Part | null
  const part: Part = asked && PARTS.includes(asked) ? asked : first

  return (
    <div className="space-y-5">
      <div className="space-y-3">
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
        {c.challan.notes ? (
          <p className="flex gap-2 rounded-xl bg-sunk/70 px-3 py-2.5 text-sm text-ink-soft">
            <StickyNote className="mt-0.5 h-4 w-4 shrink-0" aria-label={t('Notes')} />
            <span className="whitespace-pre-wrap">{c.challan.notes}</span>
          </p>
        ) : null}
      </div>

      <Result c={c} />

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

      <div className="space-y-3">
        <TabCards
          label={t('Challan details')}
          value={part}
          onChange={(p) => setParams(p === first ? {} : { tab: p }, { replace: true })}
          className="lg:grid-cols-4"
          options={[
            {
              value: 'animals',
              title: t('Animals'),
              icon: PawPrint,
              tone: 'brand',
              figure: t('{n} left', { n: c.left }),
              caption: c.closed ? t('Sold out') : c.lines.map((s) => `${s.line.animal} ${s.left}`).join(' · '),
            },
            {
              value: 'sales',
              title: t('Sales'),
              icon: Tag,
              tone: 'good',
              figure: rs(c.saleValue),
              caption: sales.length
                ? `${count(sales.length, t('sale'), t('sales'))} · ${animals(c.sold)}`
                : t('Nothing sold yet'),
            },
            {
              value: 'expenses',
              title: t('Expenses'),
              icon: Receipt,
              tone: 'owed',
              figure: rs(c.expenses),
              caption: expenses.length ? count(expenses.length, t('expense'), t('expenses')) : t('None'),
            },
            {
              value: 'supplier',
              title: t('Supplier'),
              icon: Truck,
              tone: 'bank',
              figure: rs(c.unpaid),
              caption: c.unpaid > 0.5 ? t('Left on credit') : t('Fully paid'),
            },
          ]}
        />

        {part === 'animals' ? (
          <AnimalsPart c={c} view={view} deaths={deaths} onDeath={setDeath} />
        ) : part === 'sales' ? (
          <SalesPart c={c} sales={sales} />
        ) : part === 'expenses' ? (
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
        ) : (
          <Card className="space-y-2 p-4 text-sm">
            <h2 className="mb-1 text-[15px] font-semibold">{t('Payment to the supplier')}</h2>
            <dl className="space-y-2">
              <Line label={t('Challan total')} value={rs(c.cost)} />
              <Line
                label={t('Paid at purchase ({account})', { account: accountName(c.challan.paid_from) })}
                value={rs(c.challan.paid_now)}
              />
              <Line label={t('Left on credit')} value={rs(c.unpaid)} strong />
            </dl>
            {c.unpaid > 0.5 ? <p className="pt-1 text-xs text-ink-soft">{t("The credit is on the supplier's ledger.")}</p> : null}
            {supplierLink ? (
              <Link to={supplierLink} className="btn-soft mt-2 w-full">
                <Truck className="h-4 w-4" aria-hidden />
                {t("Open {name}'s ledger", { name: c.supplier?.name ?? '' })}
              </Link>
            ) : null}
          </Card>
        )}
      </div>

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

/** The answer first: profit or loss, and where the animals are. The sum behind it opens on request. */
function Result({ c }: { c: ChallanSummary }) {
  const [open, setOpen] = useState(false)
  const animals = (n: number) => count(n, t('animal'), t('animals'))
  const loss = c.profit < -0.5
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium text-ink-soft">{c.closed ? t('Final result') : t('Result so far')}</div>
        {c.closed ? <Badge>{t('Sold out')}</Badge> : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tnum text-[2.25rem] leading-none font-semibold tracking-tight">{rs(Math.abs(c.profit))}</span>
        <Gain value={c.profit} amount={false} />
      </div>

      <div className="mt-5">
        <StockBar head={c.head} sold={c.sold} died={c.died} />
        <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
          <Count n={c.head} label={t('bought')} />
          <Count n={c.sold} label={t('sold')} tone="text-brand-deep" />
          <Count n={c.died} label={t('died')} tone={c.died ? 'text-bad' : ''} />
          <Count n={c.left} label={t('left')} />
        </dl>
      </div>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="mt-5 flex w-full items-center justify-between gap-2 border-t border-line-soft pt-3.5 text-sm font-medium text-ink-soft transition hover:text-ink"
      >
        {t('How this is worked out')}
        <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? (
        <div className="mt-3 space-y-3 text-sm">
          <dl className="space-y-2">
            <Line label={t('Sold for')} value={rs(c.saleValue)} />
            <Line
              label={t('Cost of the {animals} sold or dead', { animals: animals(c.sold + c.died) })}
              value={`− ${rs(c.costOfGone)}`}
            />
            <Line label={t('Expenses on this challan')} value={`− ${rs(c.expenses)}`} />
            <div className="border-t border-line-soft pt-2">
              <Line label={loss ? t('Loss') : t('Profit')} value={rs(Math.abs(c.profit))} strong />
            </div>
          </dl>
          <p className="rounded-xl bg-sunk/70 px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
            {c.closed
              ? t('Final: every animal is sold or dead')
              : t('In stock: {animals}, which cost {amount}. That cost counts once they are sold or die.', {
                  animals: animals(c.left),
                  amount: rs(c.stockCost),
                })}
          </p>
        </div>
      ) : null}
    </Card>
  )
}

/** A number over its word; the word comes first for screen readers. */
function Count({ n, label, tone = '' }: { n: number; label: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className={`tnum text-lg leading-tight font-semibold ${tone}`}>{n}</dd>
    </div>
  )
}

function AnimalsPart({
  c,
  view,
  deaths,
  onDeath,
}: {
  c: ChallanSummary
  view: Derived
  deaths: Death[]
  onDeath: (d: Death) => void
}) {
  return (
    <>
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
      {deaths.length ? (
        <Section
          title={t('Deaths')}
          aside={deaths.length > 1 ? t('{n} died (what they cost)', { n: c.died }) + ` ${rs(c.deathLoss)}` : undefined}
        >
          {deaths.map((d) => {
            const s = view.stats.get(d.challan_line_id)
            return (
              <Row
                key={d.id}
                onClick={() => onDeath(d)}
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
    </>
  )
}

function SalesPart({ c, sales }: { c: ChallanSummary; sales: { s: SaleView; mine: SaleView['lines'] }[] }) {
  return (
    <>
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
      {c.damagedLoss > 0 ? (
        <LossNote label={t('{n} damaged, sold below cost by', { n: c.soldDamaged })} amount={c.damagedLoss} />
      ) : null}
    </>
  )
}

/** A loss the result already includes, said once where it happened. */
function LossNote({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="rounded-card bg-bad-wash/60 px-4 py-3 text-sm">
      <dl>
        <Line label={label} value={rs(amount)} />
      </dl>
      <p className="mt-1 text-xs text-ink-soft">{t('Already counted in the profit above.')}</p>
    </div>
  )
}

function Line({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'font-semibold' : 'text-ink-soft'}>{label}</dt>
      <dd className="tnum font-semibold">{value}</dd>
    </div>
  )
}
