import { Fragment, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, Banknote, Landmark, Wallet } from 'lucide-react'
import { ExpenseForm, PaymentForm } from '../components/forms'
import { Empty, Gate, MoneyCard, PageHeader, Pills } from '../components/ui'
import { useBooks } from '../data/queries'
import { moneyBook } from '../lib/books'
import type { MoneyEntry } from '../lib/books'
import { accountName, figure, monthLabel, rs, runsOf, shortDate } from '../lib/format'
import { t } from '../lib/i18n'
import type { Expense, Payment } from '../lib/types'

type Show = 'both' | 'cash' | 'bank'

export default function Money() {
  const { view, error } = useBooks()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [paying, setPaying] = useState<Payment | 'new' | null>(null)
  const [expense, setExpense] = useState<Expense | null>(null)
  const show: Show = params.get('book') === 'cash' ? 'cash' : params.get('book') === 'bank' ? 'bank' : 'both'
  const book = useMemo(() => (view ? moneyBook(view.book, show) : null), [view, show])
  if (!view || !book) return <Gate error={error} ready={false} />

  const open = (e: MoneyEntry) => {
    const { type, id } = e.ref
    if (type === 'sale') navigate(`/sales/${id}`)
    else if (type === 'challan') navigate(`/challans/${id}`)
    else if (type === 'payment') setPaying(view.book.payments.find((p) => p.id === id) ?? null)
    else if (type === 'expense') setExpense(view.book.expenses.find((x) => x.id === id) ?? null)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('Cash & bank')}
        actions={
          <button type="button" className="btn-primary" onClick={() => setPaying('new')}>
            <ArrowLeftRight className="h-4 w-4" aria-hidden />
            {t('Payment or transfer')}
          </button>
        }
      />
      <MoneyCard
        label={t('Combined balance')}
        icon={Wallet}
        value={view.money.cash + view.money.bank}
        parts={[
          { label: t('Cash in hand'), value: view.money.cash, icon: Banknote },
          { label: t('Cash in bank'), value: view.money.bank, icon: Landmark },
        ]}
      />
      <Pills
        label={t('Which book')}
        value={show}
        onChange={(b) => setParams(b === 'both' ? {} : { book: b }, { replace: true })}
        className="sm:max-w-md"
        options={[
          { value: 'both', label: t('Balance sheet') },
          { value: 'cash', label: t('Cash') },
          { value: 'bank', label: t('Bank') },
        ]}
      />

      {book.entries.length ? (
        <Ledger entries={book.entries} both={show === 'both'} onOpen={open} />
      ) : (
        <div className="card">
          <Empty icon={Wallet} title={t('Nothing in this book yet')} />
        </div>
      )}

      <PaymentForm
        key={`payment:${paying === 'new' ? 'new' : (paying?.id ?? 'closed')}`}
        open={paying !== null}
        payment={paying && paying !== 'new' ? paying : undefined}
        start={{ kind: 'cash_to_bank' }}
        onClose={() => setPaying(null)}
      />
      <ExpenseForm key={`expense:${expense?.id ?? 'closed'}`} open={expense !== null} expense={expense ?? undefined} onClose={() => setExpense(null)} />
    </div>
  )
}

// ------------------------------------------------------------- ledger --

/**
 * Money in and money out in two coloured columns, newest first, a month at a time.
 * On a phone the balance after each line sits under its words; from sm up it gets its own column.
 */
const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_6rem_6rem] sm:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_9.5rem]'

function Ledger({ entries, both, onOpen }: { entries: MoneyEntry[]; both: boolean; onOpen: (e: MoneyEntry) => void }) {
  const runs = runsOf([...entries].reverse(), (e) => (e.date ? e.date.slice(0, 7) : 'opening'))
  return (
    <div className="card overflow-hidden">
      <div className={`${COLUMNS} border-b border-line text-[13px] font-semibold`}>
        <div className="px-3 py-2.5 text-ink-soft">{t('Details')}</div>
        <div className="bg-good-wash px-2 py-2.5 text-right text-good">{t('Money in')}</div>
        <div className="bg-bad-wash px-2 py-2.5 text-right text-bad">{t('Money out')}</div>
        <div className="hidden px-3 py-2.5 text-right text-ink-soft sm:block">{t('Balance')}</div>
      </div>
      {runs.map((run) => (
        <Fragment key={run.key}>
          {run.key === 'opening' ? null : <MonthRow month={run.key} rows={run.rows} />}
          {run.rows.map((e) => (
            <LedgerRow key={e.key} entry={e} both={both} onOpen={onOpen} />
          ))}
        </Fragment>
      ))}
    </div>
  )
}

function MonthRow({ month, rows }: { month: string; rows: MoneyEntry[] }) {
  const inflow = rows.reduce((sum, e) => sum + e.inflow, 0)
  const outflow = rows.reduce((sum, e) => sum + e.outflow, 0)
  return (
    <div className={`${COLUMNS} border-b border-line-soft text-[13px] font-semibold`}>
      <div className="bg-sunk/70 px-3 py-2">{monthLabel(month)}</div>
      <div className="tnum bg-good-wash px-2 py-2 text-right text-good">
        {inflow ? <Signed sign="+" label={t('Money in')} value={inflow} /> : null}
      </div>
      <div className="tnum bg-bad-wash px-2 py-2 text-right text-bad">
        {outflow ? <Signed sign="−" label={t('Money out')} value={outflow} /> : null}
      </div>
      <div className="hidden bg-sunk/70 sm:block" />
    </div>
  )
}

function LedgerRow({ entry: e, both, onOpen }: { entry: MoneyEntry; both: boolean; onOpen: (e: MoneyEntry) => void }) {
  const opening = e.ref.type === 'opening'
  const sub = [e.date ? shortDate(e.date) : null, both && e.account ? accountName(e.account) : null, e.detail]
    .filter(Boolean)
    .join(' · ')
  const balance = t('Balance {amount}', { amount: rs(e.balance) })
  const cells = (
    <>
      <span className="block min-w-0 px-3 py-3">
        <span className="line-clamp-2 text-[15px] leading-snug font-medium break-words">{e.label}</span>
        {sub ? <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-soft">{sub}</span> : null}
        <span className="tnum mt-1.5 inline-block rounded-md bg-sunk px-1.5 py-0.5 text-xs font-semibold sm:hidden">
          {balance}
        </span>
      </span>
      {e.moved ? (
        // A transfer between cash and bank: neither in nor out of the business.
        <span className="tnum col-span-2 flex items-start justify-center gap-1.5 bg-sunk/50 px-2 py-3 text-sm font-medium text-ink-soft">
          <ArrowLeftRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {figure(e.moved)}
        </span>
      ) : (
        <>
          <span className="tnum block bg-good-wash/45 px-2 py-3 text-right text-[15px] font-semibold text-good">
            {e.inflow && !opening ? <Signed sign="+" label={t('Money in')} value={e.inflow} /> : null}
          </span>
          <span className="tnum block bg-bad-wash/45 px-2 py-3 text-right text-[15px] font-semibold text-bad">
            {e.outflow && !opening ? <Signed sign="−" label={t('Money out')} value={e.outflow} /> : null}
          </span>
        </>
      )}
      <span className="tnum hidden px-3 py-3 text-right font-semibold sm:block">{rs(e.balance)}</span>
    </>
  )
  const cls = `${COLUMNS} w-full border-b border-line-soft text-left last:border-b-0`
  if (opening) return <div className={cls}>{cells}</div>
  return (
    <button type="button" onClick={() => onOpen(e)} className={`${cls} transition hover:bg-sunk/40 active:bg-sunk`}>
      {cells}
    </button>
  )
}

function Signed({ sign, label, value }: { sign: string; label: string; value: number }) {
  return (
    <>
      <span className="sr-only">{label} </span>
      {sign}
      {figure(value)}
    </>
  )
}
