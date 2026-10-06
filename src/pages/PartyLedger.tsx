import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftRight, Pencil, Phone, Plus } from 'lucide-react'
import { PartyForm, PaymentForm } from '../components/forms'
import { Empty, Gate, PageHeader, Row, Section, Tile } from '../components/ui'
import { useBooks } from '../data/queries'
import { customerLedger, supplierLedger } from '../lib/books'
import type { LedgerEntry } from '../lib/books'
import { rs, shortDate } from '../lib/format'
import { t } from '../lib/i18n'
import type { Payment, PartyKind } from '../lib/types'
import { balanceWord } from './Ledgers'

export default function PartyLedger({ kind }: { kind: PartyKind }) {
  const { id = '' } = useParams()
  const { view, error } = useBooks()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState<Payment | 'new' | null>(null)
  const ledger = useMemo(() => {
    if (!view) return null
    return kind === 'customer' ? customerLedger(view.book, id, view.stats) : supplierLedger(view.book, id)
  }, [view, kind, id])

  if (!view || !ledger) return <Gate error={error} ready={false} />
  const customer = kind === 'customer'
  const party = (customer ? view.book.customers : view.book.suppliers).find((p) => p.id === id)
  const back = { to: customer ? '/ledgers' : '/ledgers?tab=suppliers', label: t('Ledgers') }
  if (!party) return <PageHeader title={t('Not found')} back={back} />

  const balance = ledger.balance
  const entries = [...ledger.entries].reverse()
  const linkOf = (e: LedgerEntry) =>
    e.kind === 'sale' ? `/sales/${e.refId}` : e.kind === 'challan' ? `/challans/${e.refId}` : undefined
  const paymentOf = (e: LedgerEntry) => (e.kind === 'payment' ? view.book.payments.find((p) => p.id === e.refId) : undefined)
  const chargeWord = (e: LedgerEntry) =>
    e.kind === 'sale'
      ? t('bill {amount}', { amount: rs(e.charge) })
      : e.kind === 'challan'
        ? t('cost {amount}', { amount: rs(e.charge) })
        : t('owed {amount}', { amount: rs(e.charge) })

  return (
    <div className="space-y-6">
      <PageHeader
        back={back}
        title={party.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{customer ? t('Customer') : t('Supplier')}</span>
            {party.phone ? (
              <a href={`tel:${party.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 font-medium text-brand-deep">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {party.phone}
              </a>
            ) : null}
            {party.notes ? <span>{party.notes}</span> : null}
          </span>
        }
        actions={
          <button type="button" className="btn-ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" aria-hidden />
            {t('Edit')}
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-stretch">
        <Tile label={balanceWord(kind, balance)} value={rs(Math.abs(balance))} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
          <button type="button" className="btn-primary" onClick={() => setPaying('new')}>
            <ArrowLeftRight className="h-4 w-4" aria-hidden />
            {customer ? t('Payment received') : t('Payment made')}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => navigate(customer ? `/sales/new?customer=${party.id}` : `/challans/new?supplier=${party.id}`)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {customer ? t('New sale') : t('New challan')}
          </button>
        </div>
      </div>

      <Section title={t('Ledger, newest first')} aside={t('Balance after each')}>
        {entries.length === 0 ? (
          <Empty title={t('Nothing yet')} />
        ) : (
          entries.map((e) => {
            const payment = paymentOf(e)
            const amounts = [e.charge ? chargeWord(e) : null, e.paid ? t('paid {amount}', { amount: rs(e.paid) }) : null]
            return (
              <Row
                key={e.key}
                to={linkOf(e)}
                onClick={payment ? () => setPaying(payment) : undefined}
                title={e.detail && e.kind !== 'payment' ? `${e.label} · ${e.detail}` : e.label}
                sub={[e.date ? shortDate(e.date) : null, e.kind === 'payment' ? e.detail : null, ...amounts]
                  .filter(Boolean)
                  .join(' · ')}
                right={rs(Math.abs(e.balance))}
                rightSub={balanceWord(kind, e.balance)}
              />
            )
          })
        )}
      </Section>

      <PartyForm
        kind={kind}
        party={party}
        open={editing}
        onClose={() => setEditing(false)}
        onDeleted={() => navigate(back.to, { replace: true })}
      />
      <PaymentForm
        key={paying === 'new' ? 'new' : (paying?.id ?? 'none')}
        open={paying !== null}
        payment={paying && paying !== 'new' ? paying : undefined}
        start={customer ? { kind: 'from_customer', customerId: party.id } : { kind: 'to_supplier', supplierId: party.id }}
        onClose={() => setPaying(null)}
      />
    </div>
  )
}
