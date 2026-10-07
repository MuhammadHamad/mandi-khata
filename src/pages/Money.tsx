import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, Banknote, Landmark, Wallet } from 'lucide-react'
import { ExpenseForm, PaymentForm } from '../components/forms'
import { PeriodPicker } from '../components/PeriodPicker'
import { Empty, Gate, MoneyCard, PageHeader, Pills } from '../components/ui'
import { useBooks } from '../data/queries'
import { moneyBook } from '../lib/books'
import type { MoneyEntry } from '../lib/books'
import { accountName, figure, rs, shortDate, todayISO } from '../lib/format'
import { t } from '../lib/i18n'
import { readPeriod, writePeriod } from '../lib/period'
import type { Period } from '../lib/period'
import type { Expense, Payment } from '../lib/types'

type Show = 'both' | 'cash' | 'bank'

export default function Money() {
  const { view, error } = useBooks()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [paying, setPaying] = useState<Payment | 'new' | null>(null)
  const [expense, setExpense] = useState<Expense | null>(null)
  const show: Show = params.get('book') === 'cash' ? 'cash' : params.get('book') === 'bank' ? 'bank' : 'both'
  const today = todayISO()
  const period = readPeriod(params, today)
  const book = useMemo(() => (view ? moneyBook(view.book, show) : null), [view, show])
  if (!view || !book) return <Gate error={error} ready={false} />

  const open = (e: MoneyEntry) => {
    const { type, id } = e.ref
    if (type === 'sale') navigate(`/sales/${id}`)
    else if (type === 'challan') navigate(`/challans/${id}`)
    else if (type === 'payment') setPaying(view.book.payments.find((p) => p.id === id) ?? null)
    else if (type === 'expense') setExpense(view.book.expenses.find((x) => x.id === id) ?? null)
  }
  const showBook = (b: Show) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (b === 'both') next.delete('book')
        else next.set('book', b)
        return next
      },
      { replace: true },
    )
  const showPeriod = (p: Period) => setParams((prev) => writePeriod(prev, p, today), { replace: true })

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
        onChange={showBook}
        className="sm:max-w-md"
        options={[
          { value: 'both', label: t('Balance sheet') },
          { value: 'cash', label: t('Cash') },
          { value: 'bank', label: t('Bank') },
        ]}
      />

      {book.entries.length ? (
        <>
          <PeriodPicker
            period={period}
            today={today}
            earliest={book.entries.find((e) => e.date)?.date ?? null}
            onChange={showPeriod}
          />
          <Ledger entries={book.entries} period={period} both={show === 'both'} onOpen={open} />
        </>
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
 * One period of a book, newest first: money in and money out in two coloured columns,
 * with each column's total for the period in its heading. On a phone the balance after
 * each line sits under its words; from sm up it gets its own column. Balances run over
 * the whole book, so the last line is what stood before the period began.
 */
const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_6rem_6rem] sm:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_9.5rem]'

function Ledger({
  entries,
  period,
  both,
  onOpen,
}: {
  entries: MoneyEntry[]
  period: Period
  both: boolean
  onOpen: (e: MoneyEntry) => void
}) {
  const inPeriod = entries.filter((e) => e.date !== null && e.date >= period.from && e.date <= period.to)
  const before = entries.filter((e) => e.date === null || e.date < period.from)
  const inflow = inPeriod.reduce((sum, e) => sum + e.inflow, 0)
  const outflow = inPeriod.reduce((sum, e) => sum + e.outflow, 0)
  // What stood before the period: the opening balance itself when nothing else came before it.
  const start = before[before.length - 1]

  return (
    <div className="card overflow-hidden">
      <div className={`${COLUMNS} border-b border-line text-[13px] font-semibold`}>
        <div className="px-3 py-2.5 text-ink-soft">{t('Details')}</div>
        <div className="bg-good-wash px-2 py-2.5 text-right text-good">
          {t('Money in')}
          <div className="tnum mt-0.5 text-[15px]">
            <Signed sign="+" label={t('Money in')} value={inflow} />
          </div>
        </div>
        <div className="bg-bad-wash px-2 py-2.5 text-right text-bad">
          {t('Money out')}
          <div className="tnum mt-0.5 text-[15px]">
            <Signed sign="−" label={t('Money out')} value={outflow} />
          </div>
        </div>
        <div className="hidden px-3 py-2.5 text-right text-ink-soft sm:block">{t('Balance')}</div>
      </div>
      <div className="divide-y divide-line-soft">
        {inPeriod.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-ink-soft">{t('Nothing in this period')}</div>
        ) : (
          [...inPeriod].reverse().map((e) => <LedgerRow key={e.key} entry={e} both={both} onOpen={onOpen} />)
        )}
        {start ? (
          <StartRow
            label={start.ref.type === 'opening' ? start.label : t('Earlier balance')}
            detail={start.ref.type === 'opening' ? start.detail : t('Before {date}', { date: shortDate(period.from) })}
            balance={start.balance}
          />
        ) : null}
      </div>
    </div>
  )
}

function LedgerRow({ entry: e, both, onOpen }: { entry: MoneyEntry; both: boolean; onOpen: (e: MoneyEntry) => void }) {
  const sub = [e.date ? shortDate(e.date) : null, both && e.account ? accountName(e.account) : null, e.detail]
    .filter(Boolean)
    .join(' · ')
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      className={`${COLUMNS} w-full text-left transition hover:bg-sunk/40 active:bg-sunk`}
    >
      <Words label={e.label} detail={sub} balance={e.balance} />
      {e.moved ? (
        // A transfer between cash and bank: neither in nor out of the business.
        <span className="tnum col-span-2 flex items-start justify-center gap-1.5 bg-sunk/50 px-2 py-3 text-sm font-medium text-ink-soft">
          <ArrowLeftRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {figure(e.moved)}
        </span>
      ) : (
        <>
          <span className="tnum block bg-good-wash/45 px-2 py-3 text-right text-[15px] font-semibold text-good">
            {e.inflow ? <Signed sign="+" label={t('Money in')} value={e.inflow} /> : null}
          </span>
          <span className="tnum block bg-bad-wash/45 px-2 py-3 text-right text-[15px] font-semibold text-bad">
            {e.outflow ? <Signed sign="−" label={t('Money out')} value={e.outflow} /> : null}
          </span>
        </>
      )}
      <span className="tnum hidden px-3 py-3 text-right font-semibold sm:block">{rs(e.balance)}</span>
    </button>
  )
}

/** The balance the period started from: no money moves on this line. */
function StartRow({ label, detail, balance }: { label: string; detail: string; balance: number }) {
  return (
    <div className={COLUMNS}>
      <Words label={label} detail={detail} balance={balance} />
      <span className="bg-good-wash/45" />
      <span className="bg-bad-wash/45" />
      <span className="tnum hidden px-3 py-3 text-right font-semibold sm:block">{rs(balance)}</span>
    </div>
  )
}

function Words({ label, detail, balance }: { label: string; detail: string; balance: number }) {
  return (
    <span className="block min-w-0 px-3 py-3">
      <span className="line-clamp-2 text-[15px] leading-snug font-medium break-words">{label}</span>
      {detail ? <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-soft">{detail}</span> : null}
      <span className="tnum mt-1.5 inline-block rounded-md bg-sunk px-1.5 py-0.5 text-xs font-semibold sm:hidden">
        {t('Balance {amount}', { amount: rs(balance) })}
      </span>
    </span>
  )
}

function Signed({ sign, label, value }: { sign: string; label: string; value: number }) {
  return (
    <>
      <span className="sr-only">{label} </span>
      {value ? sign : ''}
      {figure(value)}
    </>
  )
}
