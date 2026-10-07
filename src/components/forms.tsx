/**
 * The small forms that open over a page: a customer or supplier, a death,
 * a payment, an expense. Each mounts fresh when opened, so it never shows
 * what was typed last time.
 */
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Receipt, Trash2 } from 'lucide-react'
import { backend } from '../data/backend'
import { useAction, useBooks } from '../data/queries'
import { expenseCategories, paymentLabel } from '../lib/books'
import type { Derived } from '../lib/books'
import { plain, rs, shortDate, todayISO, toNumber } from '../lib/format'
import { t } from '../lib/i18n'
import { uuid } from '../lib/ids'
import {
  checkDeath,
  checkExpense,
  checkParty,
  checkPayment,
  whyCantDeleteParty,
} from '../lib/rules'
import type { Account, Death, Expense, Party, PartyInput, PartyKind, Payment, PaymentKind } from '../lib/types'
import { Combobox } from './Combobox'
import { SearchPicker } from './SearchPicker'
import { AccountPills, LinePicker, PartyPicker } from './pickers'
import { ConfirmDialog, CountInput, ErrorNote, Field, IconBadge, Loading, Modal, MoneyInput, NumberBadge } from './ui'

type Opened = { open: boolean; onClose: () => void }

/** True when the save went through. When it fails, the mutation holds the error and the form shows it. */
async function settle(work: Promise<unknown>): Promise<boolean> {
  try {
    await work
    return true
  } catch {
    return false
  }
}

/** Save across the bottom of the sheet; Delete, when there is one, as a quiet word beside it. */
function FormButtons({ busy, onDelete }: { busy: boolean; onDelete?: () => void }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      {onDelete ? (
        <button type="button" className="btn-quiet text-bad hover:text-bad" onClick={onDelete} disabled={busy}>
          <Trash2 className="h-4 w-4" aria-hidden />
          {t('Delete')}
        </button>
      ) : null}
      <button type="submit" className="btn-primary min-h-12 flex-1 text-base" disabled={busy}>
        {busy ? t('Saving…') : t('Save')}
      </button>
    </div>
  )
}

/** Wraps a form body so it only exists while open, and waits for the book. */
function Sheet({ open, onClose, title, children }: Opened & { title: string; children: (view: Derived) => ReactNode }) {
  const { view } = useBooks()
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {open ? view ? children(view) : <Loading /> : null}
    </Modal>
  )
}

// ---------------------------------------------------- customer, supplier --

export function PartyForm({
  kind,
  party,
  name,
  open,
  onClose,
  onSaved,
  onDeleted,
}: Opened & {
  kind: PartyKind
  party?: Party
  /** For a new one: the name already typed while looking for them. */
  name?: string
  onSaved?: (id: string) => void
  onDeleted?: () => void
}) {
  const title =
    kind === 'customer'
      ? party
        ? t('Edit customer')
        : t('New customer')
      : party
        ? t('Edit supplier')
        : t('New supplier')
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {(view) => (
        <PartyBody
          view={view}
          kind={kind}
          party={party}
          startName={name}
          onClose={onClose}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </Sheet>
  )
}

function PartyBody({
  view,
  kind,
  party,
  startName,
  onClose,
  onSaved,
  onDeleted,
}: {
  view: Derived
  kind: PartyKind
  party?: Party
  startName?: string
  onClose: () => void
  onSaved?: (id: string) => void
  onDeleted?: () => void
}) {
  const [name, setName] = useState(party?.name ?? startName ?? '')
  const [phone, setPhone] = useState(party?.phone ?? '')
  const [opening, setOpening] = useState(party?.opening_balance ? plain(party.opening_balance) : '')
  const [notes, setNotes] = useState(party?.notes ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const save = useAction((input: PartyInput) => backend.saveParty(kind, input))
  const remove = useAction((id: string) => backend.deleteParty(kind, id))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const input = {
      id: party?.id ?? uuid(),
      name,
      phone,
      notes,
      opening_balance: opening.trim() === '' ? 0 : toNumber(opening),
    }
    const why = checkParty(view.book, kind, input)
    setProblem(why)
    if (why) return
    if (!(await settle(save.mutateAsync(input)))) return
    onSaved?.(input.id)
    onClose()
  }

  const askDelete = () => {
    const why = party ? whyCantDeleteParty(view.book, kind, party.id) : null
    setProblem(why)
    if (!why) setConfirming(true)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t('Name')}>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!party} />
      </Field>
      <Field label={t('Phone')}>
        <input className="field" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field
        label={kind === 'customer' ? t('Already owed to you') : t('You already owed them')}
        hint={t('Credit from before you started using the app. Leave empty if none.')}
      >
        <MoneyInput value={opening} onChange={setOpening} />
      </Field>
      <Field label={t('Notes')}>
        <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorNote error={problem ?? save.error} />
      <FormButtons busy={save.isPending} onDelete={party ? askDelete : undefined} />
      {party ? (
        <ConfirmDialog
          open={confirming}
          title={t('Delete {name}?', { name: party.name })}
          message={t('They have no records, so nothing else changes.')}
          busy={remove.isPending}
          error={remove.error}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            if (!(await settle(remove.mutateAsync(party.id)))) return
            setConfirming(false)
            onClose()
            onDeleted?.()
          }}
        />
      ) : null}
    </form>
  )
}

// ---------------------------------------------------------------- death --

export function DeathForm({
  death,
  lineId,
  open,
  onClose,
}: Opened & { death?: Death; /** Start on these animals, for a form opened from a challan. */ lineId?: string }) {
  return (
    <Sheet open={open} onClose={onClose} title={death ? t('Edit death') : t('Record a death')}>
      {(view) => <DeathBody view={view} death={death} lineId={lineId} onClose={onClose} />}
    </Sheet>
  )
}

function DeathBody({ view, death, lineId, onClose }: { view: Derived; death?: Death; lineId?: string; onClose: () => void }) {
  const [line, setLine] = useState(death?.challan_line_id ?? lineId ?? '')
  const [head, setHead] = useState(death ? String(death.head) : '1')
  const [date, setDate] = useState(death?.died_on ?? todayISO())
  const [cause, setCause] = useState(death?.cause ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const save = useAction(backend.saveDeath)
  const remove = useAction(backend.deleteDeath)
  const stats = view.stats.get(line)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const input = { id: death?.id ?? uuid(), challan_line_id: line, head: Number(head), died_on: date, cause }
    const why = checkDeath(view.book, input)
    setProblem(why)
    if (why) return
    if (!(await settle(save.mutateAsync(input)))) return
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t('Which animals')}>
        <LinePicker view={view} value={line} onChange={setLine} skip={{ deathId: death?.id }} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('How many died')}>
          <CountInput value={head} onChange={setHead} />
        </Field>
        <Field label={t('Date')}>
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label={t('Cause')} hint={t('Optional.')}>
        <input className="field" value={cause} onChange={(e) => setCause(e.target.value)} />
      </Field>
      {stats && Number(head) > 0 ? (
        <p className="text-sm text-ink-soft">
          {t("They cost {amount}. That comes off challan #{n}'s profit.", {
            amount: rs(stats.each * Number(head)),
            n: stats.challan.number,
          })}
        </p>
      ) : null}
      <ErrorNote error={problem ?? save.error} />
      <FormButtons busy={save.isPending} onDelete={death ? () => setConfirming(true) : undefined} />
      {death ? (
        <ConfirmDialog
          open={confirming}
          title={t('Delete this death?')}
          message={t('The animals count as in stock again.')}
          busy={remove.isPending}
          error={remove.error}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            if (!(await settle(remove.mutateAsync(death.id)))) return
            onClose()
          }}
        />
      ) : null}
    </form>
  )
}

// -------------------------------------------------------------- payment --

const KINDS: PaymentKind[] = ['from_customer', 'to_supplier', 'cash_to_bank', 'bank_to_cash', 'owner_in', 'owner_out']

export function PaymentForm({
  payment,
  start,
  open,
  onClose,
}: Opened & {
  payment?: Payment
  /** How a new payment starts, e.g. from a customer's page. */
  start?: { kind: PaymentKind; customerId?: string; supplierId?: string }
}) {
  return (
    <Sheet open={open} onClose={onClose} title={payment ? t('Edit payment') : t('Payment or transfer')}>
      {(view) => <PaymentBody view={view} payment={payment} start={start} onClose={onClose} />}
    </Sheet>
  )
}

function PaymentBody({
  view,
  payment,
  start,
  onClose,
}: {
  view: Derived
  payment?: Payment
  start?: { kind: PaymentKind; customerId?: string; supplierId?: string }
  onClose: () => void
}) {
  const [kind, setKind] = useState<PaymentKind>(payment?.kind ?? start?.kind ?? 'from_customer')
  const [customer, setCustomer] = useState(payment?.customer_id ?? start?.customerId ?? '')
  const [supplier, setSupplier] = useState(payment?.supplier_id ?? start?.supplierId ?? '')
  const [account, setAccount] = useState<Account>(payment?.account ?? 'cash')
  const [amount, setAmount] = useState(payment ? plain(payment.amount) : '')
  const [date, setDate] = useState(payment?.paid_on ?? todayISO())
  const [notes, setNotes] = useState(payment?.notes ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const save = useAction(backend.savePayment)
  const remove = useAction(backend.deletePayment)
  const transfer = kind === 'cash_to_bank' || kind === 'bank_to_cash'

  const owed =
    kind === 'from_customer' && customer
      ? view.balances.customers.get(customer)
      : kind === 'to_supplier' && supplier
        ? view.balances.suppliers.get(supplier)
        : undefined

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const input = {
      id: payment?.id ?? uuid(),
      paid_on: date,
      kind,
      customer_id: kind === 'from_customer' ? customer : null,
      supplier_id: kind === 'to_supplier' ? supplier : null,
      account: transfer ? null : account,
      amount: toNumber(amount),
      notes,
    }
    const why = checkPayment(view.book, input)
    setProblem(why)
    if (why) return
    if (!(await settle(save.mutateAsync(input)))) return
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t('What happened')}>
        <select className="field" value={kind} onChange={(e) => setKind(e.target.value as PaymentKind)}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {paymentLabel(k)}
            </option>
          ))}
        </select>
      </Field>
      {kind === 'from_customer' ? (
        <Field label={t('Customer')} hint={owed !== undefined ? owedHint(owed, 'customer') : undefined}>
          <PartyPicker view={view} kind="customer" value={customer} onChange={setCustomer} />
        </Field>
      ) : null}
      {kind === 'to_supplier' ? (
        <Field label={t('Supplier')} hint={owed !== undefined ? owedHint(owed, 'supplier') : undefined}>
          <PartyPicker view={view} kind="supplier" value={supplier} onChange={setSupplier} />
        </Field>
      ) : null}
      <Field label={t('Amount')}>
        <MoneyInput value={amount} onChange={setAmount} />
      </Field>
      {transfer ? null : (
        <div>
          <span className="label">{kind === 'from_customer' || kind === 'owner_in' ? t('Into') : t('Paid from')}</span>
          <AccountPills label={t('Cash or bank')} value={account} onChange={setAccount} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Date')}>
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('Notes')}>
          <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <ErrorNote error={problem ?? save.error} />
      <FormButtons busy={save.isPending} onDelete={payment ? () => setConfirming(true) : undefined} />
      {payment ? (
        <ConfirmDialog
          open={confirming}
          title={t('Delete this payment?')}
          message={t('Balances and the cash book go back to how they were without it.')}
          busy={remove.isPending}
          error={remove.error}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            if (!(await settle(remove.mutateAsync(payment.id)))) return
            onClose()
          }}
        />
      ) : null}
    </form>
  )
}

function owedHint(balance: number, kind: PartyKind): string {
  if (Math.abs(balance) < 0.5) return t('Nothing owed right now.')
  if (kind === 'customer') {
    return balance > 0
      ? t('Owes you {amount}.', { amount: rs(balance) })
      : t('Has paid {amount} in advance.', { amount: rs(-balance) })
  }
  return balance > 0
    ? t('You owe {amount}.', { amount: rs(balance) })
    : t('You have paid {amount} in advance.', { amount: rs(-balance) })
}

// -------------------------------------------------------------- expense --

export function ExpenseForm({
  expense,
  challanId,
  open,
  onClose,
}: Opened & { expense?: Expense; /** Start linked to this challan. */ challanId?: string }) {
  return (
    <Sheet open={open} onClose={onClose} title={expense ? t('Edit expense') : t('New expense')}>
      {(view) => <ExpenseBody view={view} expense={expense} challanId={challanId} onClose={onClose} />}
    </Sheet>
  )
}

function ExpenseBody({
  view,
  expense,
  challanId,
  onClose,
}: {
  view: Derived
  expense?: Expense
  challanId?: string
  onClose: () => void
}) {
  const [category, setCategory] = useState(expense?.category ?? '')
  const [amount, setAmount] = useState(expense ? plain(expense.amount) : '')
  const [account, setAccount] = useState<Account>(expense?.paid_from ?? 'cash')
  const [challan, setChallan] = useState(expense?.challan_id ?? challanId ?? '')
  const [date, setDate] = useState(expense?.spent_on ?? todayISO())
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const save = useAction(backend.saveExpense)
  const remove = useAction(backend.deleteExpense)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const input = {
      id: expense?.id ?? uuid(),
      spent_on: date,
      category,
      amount: toNumber(amount),
      paid_from: account,
      challan_id: challan || null,
      notes,
    }
    const why = checkExpense(view.book, input)
    setProblem(why)
    if (why) return
    if (!(await settle(save.mutateAsync(input)))) return
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t('What for')}>
        <Combobox
          value={category}
          onChange={setCategory}
          options={expenseCategories(view.book.expenses)}
          placeholder={t('Transport, fodder, rent…')}
          autoFocus={!expense}
        />
      </Field>
      <Field label={t('Amount')}>
        <MoneyInput value={amount} onChange={setAmount} />
      </Field>
      <div>
        <span className="label">{t('Paid from')}</span>
        <AccountPills label={t('Paid from')} value={account} onChange={setAccount} />
      </div>
      <Field
        label={t('For which challan')}
        hint={challan ? t("It comes off that challan's profit, and this month's.") : t("General costs come off the month's profit only.")}
      >
        <SearchPicker
          value={challan}
          onChange={setChallan}
          title={t('For which challan')}
          placeholder={t('Not for one challan (rent, wages…)')}
          searchPlaceholder={t('Search by supplier or challan')}
          emptyText={t('No challans yet')}
          items={[
            { id: '', title: t('Not for one challan (rent, wages…)'), pinned: true, leading: <IconBadge icon={Receipt} /> },
            // Challans with animals still in hand first, newest first in each.
            ...[...view.challans]
              .sort((a, b) => Number(a.closed) - Number(b.closed) || b.challan.number - a.challan.number)
              .map((c) => {
                const supplier = c.supplier?.name ?? t('Supplier')
                return {
                  id: c.challan.id,
                  group: c.closed ? t('Sold out') : t('Animals in stock'),
                  title: `${t('Challan #{n}', { n: c.challan.number })} · ${supplier}`,
                  sub: t('bought {date}', { date: shortDate(c.challan.bought_on) }),
                  right: c.closed ? undefined : t('{n} left', { n: c.left }),
                  words: `#${c.challan.number}`,
                  leading: <NumberBadge n={c.challan.number} />,
                  label: `#${c.challan.number} · ${supplier} · ${shortDate(c.challan.bought_on)}${
                    c.closed ? ` · ${t('sold out')}` : ''
                  }`,
                }
              }),
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Date')}>
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('Notes')}>
          <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <ErrorNote error={problem ?? save.error} />
      <FormButtons busy={save.isPending} onDelete={expense ? () => setConfirming(true) : undefined} />
      {expense ? (
        <ConfirmDialog
          open={confirming}
          title={t('Delete this expense?')}
          message={`${expense.category}, ${rs(expense.amount)}, ${shortDate(expense.spent_on)}.`}
          busy={remove.isPending}
          error={remove.error}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            if (!(await settle(remove.mutateAsync(expense.id)))) return
            onClose()
          }}
        />
      ) : null}
    </form>
  )
}
