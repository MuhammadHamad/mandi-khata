import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowLeftRight, Banknote, BookOpen, MessageCircle, Pencil, Phone, Plus, Tag, Truck } from 'lucide-react'
import { PartyForm, PaymentForm } from '../components/forms'
import { Avatar, Badge, Card, Empty, Gate, IconBadge, PageHeader, Row, Section } from '../components/ui'
import { useBooks } from '../data/queries'
import { balanceTone, balanceWord } from '../lib/balance'
import { customerLedger, supplierLedger } from '../lib/books'
import type { LedgerEntry } from '../lib/books'
import { rs, shortDate, todayISO } from '../lib/format'
import { t } from '../lib/i18n'
import { balanceMessage, whatsappLink } from '../lib/share'
import type { Payment, PartyKind } from '../lib/types'

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
  const iconOf = (e: LedgerEntry) =>
    e.kind === 'sale' ? (
      <IconBadge icon={Tag} tone="brand" />
    ) : e.kind === 'challan' ? (
      <IconBadge icon={Truck} tone="bank" />
    ) : e.kind === 'payment' ? (
      <IconBadge icon={Banknote} tone="good" />
    ) : (
      <IconBadge icon={BookOpen} />
    )

  return (
    <div className="space-y-5">
      <Link
        to={back.to}
        className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm font-medium text-ink-soft transition hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {back.label}
      </Link>

      <Card className="p-5">
        <div className="flex items-center gap-4">
          <Avatar name={party.name} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-2 text-xl leading-snug font-semibold tracking-tight break-words">{party.name}</h1>
            <div className="truncate text-sm text-ink-soft">
              {[customer ? t('Customer') : t('Supplier'), party.phone, party.notes].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={t('Edit')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-sunk hover:text-ink"
          >
            <Pencil className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-sunk/70 p-4">
          <Badge tone={balanceTone(kind, balance)}>{balanceWord(kind, balance)}</Badge>
          <div className="mt-2 text-[2rem] leading-none font-semibold tracking-tight">{rs(Math.abs(balance))}</div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="btn-primary" onClick={() => setPaying('new')}>
            <ArrowLeftRight className="h-4 w-4" aria-hidden />
            {customer ? t('Payment received') : t('Payment made')}
          </button>
          <button
            type="button"
            className="btn-soft"
            onClick={() => navigate(customer ? `/sales/new?customer=${party.id}` : `/challans/new?supplier=${party.id}`)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {customer ? t('New sale') : t('New challan')}
          </button>
        </div>
        <div className={`mt-2 grid gap-2 ${party.phone ? 'grid-cols-2' : ''}`}>
          {party.phone ? (
            <a href={`tel:${party.phone.replace(/\s/g, '')}`} className="btn-ghost">
              <Phone className="h-4 w-4" aria-hidden />
              {t('Call')}
            </a>
          ) : null}
          {/* Opens WhatsApp with the balance written out; without a number, WhatsApp asks which chat. */}
          <a
            href={whatsappLink(
              party.phone,
              balanceMessage({
                kind,
                name: party.name,
                balance,
                business: view.book.settings.business_name,
                today: todayISO(),
              }),
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-whatsapp"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            {t('WhatsApp')}
          </a>
        </div>
      </Card>

      <Section title={t('Ledger, newest first')} aside={t('Balance after each')}>
        {entries.length === 0 ? (
          <Empty icon={BookOpen} title={t('Nothing yet')} />
        ) : (
          entries.map((e) => {
            const payment = paymentOf(e)
            const amounts = [e.charge ? chargeWord(e) : null, e.paid ? t('paid {amount}', { amount: rs(e.paid) }) : null]
            return (
              <Row
                key={e.key}
                to={linkOf(e)}
                onClick={payment ? () => setPaying(payment) : undefined}
                leading={iconOf(e)}
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
        key={`payment:${paying === 'new' ? 'new' : (paying?.id ?? 'closed')}`}
        open={paying !== null}
        payment={paying && paying !== 'new' ? paying : undefined}
        start={customer ? { kind: 'from_customer', customerId: party.id } : { kind: 'to_supplier', supplierId: party.id }}
        onClose={() => setPaying(null)}
      />
    </div>
  )
}
