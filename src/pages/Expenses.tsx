import { useState } from 'react'
import { Plus, Receipt } from 'lucide-react'
import { ExpenseForm } from '../components/forms'
import { Empty, Gate, IconBadge, PageHeader, Row, Section } from '../components/ui'
import { useBooks } from '../data/queries'
import { accountName, monthLabel, rs, runsOf, shortDate, todayISO } from '../lib/format'
import { t } from '../lib/i18n'
import type { Expense } from '../lib/types'

export default function Expenses() {
  const { view, error } = useBooks()
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  if (!view) return <Gate error={error} ready={false} />

  const numbers = new Map(view.book.challans.map((c) => [c.id, c.number]))
  const list = [...view.book.expenses].sort(
    (a, b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at),
  )
  const month = todayISO().slice(0, 7)
  const thisMonth = list.filter((e) => e.spent_on.startsWith(month)).reduce((sum, e) => sum + e.amount, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('Expenses')}
        subtitle={t('This month: {amount}', { amount: rs(thisMonth) })}
        actions={
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('New expense')}
          </button>
        }
      />
      {list.length === 0 ? (
        <div className="card">
          <Empty icon={Receipt} title={t('No expenses yet')}>
            {t('Transport, fodder, rent, wages: anything the business pays for.')}
          </Empty>
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
      <ExpenseForm
        key={`expense:${editing === 'new' ? 'new' : (editing?.id ?? 'closed')}`}
        open={editing !== null}
        expense={editing && editing !== 'new' ? editing : undefined}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}
