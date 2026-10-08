import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Receipt } from 'lucide-react'
import { ExpenseForm } from '../components/forms'
import { PeriodPicker } from '../components/PeriodPicker'
import { SummaryCard, SummaryLine } from '../components/Summary'
import { Empty, Gate, IconBadge, PageHeader, Row, Section } from '../components/ui'
import { useBooks } from '../data/queries'
import { accountName, count, monthLabel, rs, runsOf, shortDate, todayISO } from '../lib/format'
import { t } from '../lib/i18n'
import { readPeriod, writePeriod } from '../lib/period'
import type { Expense } from '../lib/types'

export default function Expenses() {
  const { view, error } = useBooks()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const today = todayISO()
  const period = readPeriod(params, today)
  if (!view) return <Gate error={error} ready={false} />

  const numbers = new Map(view.book.challans.map((c) => [c.id, c.number]))
  const all = [...view.book.expenses].sort(
    (a, b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at),
  )
  const list = all.filter((e) => e.spent_on >= period.from && e.spent_on <= period.to)
  const earliest = all[all.length - 1]?.spent_on ?? null

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('Expenses')}
        actions={
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('New expense')}
          </button>
        }
      />
      {all.length === 0 ? (
        <div className="card">
          <Empty icon={Receipt} title={t('No expenses yet')}>
            {t('Transport, fodder, rent, wages: anything the business pays for.')}
          </Empty>
        </div>
      ) : (
        <>
          <PeriodPicker
            period={period}
            today={today}
            earliest={earliest}
            onChange={(p) => setParams((prev) => writePeriod(prev, p, today), { replace: true })}
          />
          <ExpensesSummary expenses={list} />
          {list.length === 0 ? (
            <div className="card">
              <Empty icon={Receipt} title={t('Nothing in this period')} />
            </div>
          ) : (
            runsOf(list, (e) => e.spent_on.slice(0, 7)).map((run) => (
              <Section
                key={run.key}
                title={monthLabel(run.key)}
                aside={<span className="tnum font-medium">{rs(run.rows.reduce((sum, e) => sum + e.amount, 0))}</span>}
              >
                {run.rows.map((e) => (
                  <Row
                    key={e.id}
                    onClick={() => setEditing(e)}
                    leading={<IconBadge icon={Receipt} tone="owed" />}
                    title={e.category}
                    sub={[
                      shortDate(e.spent_on),
                      e.challan_id ? t('Challan #{n}', { n: numbers.get(e.challan_id) ?? '?' }) : t('General'),
                      e.notes,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    right={rs(e.amount)}
                    rightSub={accountName(e.paid_from)}
                  />
                ))}
              </Section>
            ))
          )}
        </>
      )}
      <ExpenseForm
        key={`expense:${editing === 'new' ? 'new' : (editing?.id ?? 'closed')}`}
        open={editing !== null}
        expense={editing && editing !== 'new' ? editing : undefined}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

/** Kinds of expense named one by one before the rest are summed as "Others". */
const NAMED = 4

/**
 * The period's spending in one card: the total, how much of it went on challans and how
 * much on the business in general, then what it went on, biggest first.
 */
function ExpensesSummary({ expenses }: { expenses: Expense[] }) {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  const onChallans = expenses.reduce((sum, e) => sum + (e.challan_id ? e.amount : 0), 0)

  // "chara" and "Chara" are one kind of expense, under the spelling used most recently.
  const kinds = new Map<string, { category: string; amount: number }>()
  for (const e of expenses) {
    const key = e.category.trim().toLowerCase()
    const kind = kinds.get(key) ?? { category: e.category.trim(), amount: 0 }
    kind.amount += e.amount
    kinds.set(key, kind)
  }
  const ranked = [...kinds.values()].sort((a, b) => b.amount - a.amount)
  const named = ranked.length > NAMED + 1 ? ranked.slice(0, NAMED) : ranked
  const others = ranked.slice(named.length)
  const biggest = ranked[0]?.amount ?? 0

  return (
    <SummaryCard
      label={t('Total expenses')}
      total={rs(total)}
      sub={count(expenses.length, t('expense'), t('expenses'))}
      extra={
        total > 0 ? (
          <dl className="space-y-1.5 text-sm">
            <SummaryLine label={t('On challans')} value={rs(onChallans)} />
            <SummaryLine label={t('General expenses')} value={rs(total - onChallans)} />
          </dl>
        ) : undefined
      }
    >
      {ranked.length === 0 ? (
        <div className="text-ink-soft">{t('Nothing in this period')}</div>
      ) : (
        <>
          {named.map((k) => (
            <Share key={k.category} label={k.category} amount={k.amount} biggest={biggest} />
          ))}
          {others.length ? (
            <Share
              label={t('Others ({n})', { n: others.length })}
              amount={others.reduce((sum, k) => sum + k.amount, 0)}
              biggest={biggest}
            />
          ) : null}
        </>
      )}
    </SummaryCard>
  )
}

/** One kind of expense: its name and amount, over a thin bar measured against the biggest. */
function Share({ label, amount, biggest }: { label: string; amount: number; biggest: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="min-w-0 truncate font-medium">{label}</dt>
        <dd className="tnum shrink-0 font-semibold">{rs(amount)}</dd>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunk" aria-hidden>
        <div
          className="h-full rounded-full bg-owed"
          style={{ width: `${biggest > 0 ? Math.max(3, (amount / biggest) * 100) : 0}%` }}
        />
      </div>
    </div>
  )
}
