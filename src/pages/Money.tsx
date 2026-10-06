import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight } from 'lucide-react'
import { ExpenseForm, PaymentForm } from '../components/forms'
import { Empty, Gate, PageHeader, Pills, Row, Section, Tile } from '../components/ui'
import { useBooks } from '../data/queries'
import { moneyBook, paymentLabel } from '../lib/books'
import type { MoneyEntry } from '../lib/books'
import { accountName, monthLabel, rs, runsOf, shortDate } from '../lib/format'
import { t } from '../lib/i18n'
import type { Expense, Payment } from '../lib/types'

type Show = 'cash' | 'bank' | 'payments'

export default function Money() {
  const { view, error } = useBooks()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [paying, setPaying] = useState<Payment | 'new' | null>(null)
  const [expense, setExpense] = useState<Expense | null>(null)
  const show: Show = params.get('book') === 'bank' ? 'bank' : params.get('book') === 'payments' ? 'payments' : 'cash'
  const book = useMemo(() => (view && show !== 'payments' ? moneyBook(view.book, show) : null), [view, show])
  if (!view) return <Gate error={error} ready={false} />

  const open = (e: MoneyEntry) => {
    const { type, id } = e.ref
    if (type === 'sale') navigate(`/sales/${id}`)
    else if (type === 'challan') navigate(`/challans/${id}`)
    else if (type === 'payment') setPaying(view.book.payments.find((p) => p.id === id) ?? null)
    else if (type === 'expense') setExpense(view.book.expenses.find((x) => x.id === id) ?? null)
  }
  const names = new Map([...view.book.customers, ...view.book.suppliers].map((p) => [p.id, p.name]))
  const payments = [...view.book.payments].sort(
    (a, b) => b.paid_on.localeCompare(a.paid_on) || b.created_at.localeCompare(a.created_at),
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Cash & bank')}
        actions={
          <button type="button" className="btn-primary" onClick={() => setPaying('new')}>
            <ArrowLeftRight className="h-4 w-4" aria-hidden />
            {t('Payment or transfer')}
          </button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile label={t('Cash in hand')} value={rs(view.money.cash)} />
        <Tile label={t('Bank')} value={rs(view.money.bank)} />
        <div className="col-span-2 lg:col-span-1">
          <Tile label={t('Together')} value={rs(view.money.cash + view.money.bank)} />
        </div>
      </div>
      <Pills
        label={t('Which book')}
        value={show}
        onChange={(b) => setParams(b === 'cash' ? {} : { book: b }, { replace: true })}
        className="max-w-md"
        options={[
          { value: 'cash', label: t('Cash book') },
          { value: 'bank', label: t('Bank book') },
          { value: 'payments', label: t('Payments') },
        ]}
      />

      {show === 'payments' ? (
        <Section title={t('Payments and transfers')}>
          {payments.length === 0 ? (
            <Empty title={t('No payments yet')}>{t('Later payments from customers and to suppliers show here.')}</Empty>
          ) : (
            payments.map((p) => (
              <Row
                key={p.id}
                onClick={() => setPaying(p)}
                title={paymentLabel(p.kind)}
                sub={[
                  shortDate(p.paid_on),
                  names.get(p.customer_id ?? p.supplier_id ?? ''),
                  p.account ? accountName(p.account) : null,
                  p.notes,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={rs(p.amount)}
              />
            ))
          )}
        </Section>
      ) : book && book.entries.length ? (
        runsOf([...book.entries].reverse(), (e) => (e.date ? e.date.slice(0, 7) : 'opening')).map((run) => (
          <Section
            key={run.key}
            title={run.key === 'opening' ? t('Start') : monthLabel(run.key)}
            aside={t('Balance after each')}
          >
            {run.rows.map((e) => (
              <Row
                key={e.key}
                onClick={e.ref.type === 'opening' ? undefined : () => open(e)}
                title={
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{e.label}</span>
                    <span className={`tnum shrink-0 text-sm font-semibold ${e.inflow ? 'text-good' : 'text-ink-soft'}`}>
                      {e.inflow ? `+ ${rs(e.inflow)}` : `− ${rs(e.outflow)}`}
                    </span>
                  </span>
                }
                sub={[e.date ? shortDate(e.date) : null, e.detail].filter(Boolean).join(' · ')}
                right={rs(e.balance)}
              />
            ))}
          </Section>
        ))
      ) : (
        <div className="card">
          <Empty title={t('Nothing in this book yet')} />
        </div>
      )}

      <PaymentForm
        key={paying === 'new' ? 'new' : (paying?.id ?? 'none')}
        open={paying !== null}
        payment={paying && paying !== 'new' ? paying : undefined}
        start={{ kind: 'cash_to_bank' }}
        onClose={() => setPaying(null)}
      />
      <ExpenseForm key={expense?.id ?? 'none'} open={expense !== null} expense={expense ?? undefined} onClose={() => setExpense(null)} />
    </div>
  )
}
