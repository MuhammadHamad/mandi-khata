import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { AccountPills, LinePicker, PartyPicker, firstOpenLine } from '../components/pickers'
import { emptyQty, qtyFrom, qtyValues, setEach, setHead, setTotal } from '../components/qty'
import type { Qty } from '../components/qty'
import { ActionBar, Card, CountInput, ErrorNote, Field, Gain, Gate, MoneyInput, PageHeader } from '../components/ui'
import { backend } from '../data/backend'
import { useAction, useBooks } from '../data/queries'
import { costOf } from '../lib/books'
import type { Derived } from '../lib/books'
import { plain, rs, todayISO, toNumber } from '../lib/format'
import { t } from '../lib/i18n'
import { uuid } from '../lib/ids'
import { checkSale } from '../lib/rules'
import type { Account, Sale } from '../lib/types'

type Draft = Qty & { id: string; lineId: string; damaged: boolean }

export default function SaleForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { view, error } = useBooks()
  if (!view) return <Gate error={error} ready={false} />
  const sale = id ? view.book.sales.find((s) => s.id === id) : undefined
  if (id && !sale) return <PageHeader title={t('Sale not found')} back={{ to: '/sales', label: t('Sales') }} />
  return (
    <Editor
      key={id ?? 'new'}
      view={view}
      sale={sale}
      startLine={firstOpenLine(view, params.get('challan'))}
      startCustomer={params.get('customer') ?? ''}
    />
  )
}

function Editor({
  view,
  sale,
  startLine,
  startCustomer,
}: {
  view: Derived
  sale?: Sale
  startLine: string
  startCustomer: string
}) {
  const navigate = useNavigate()
  const save = useAction(backend.saveSale)
  const [customer, setCustomer] = useState(sale?.customer_id ?? startCustomer)
  const [date, setDate] = useState(sale?.sold_on ?? todayISO())
  const [lines, setLines] = useState<Draft[]>(() =>
    sale
      ? view.book.saleLines
          .filter((l) => l.sale_id === sale.id)
          .sort((a, b) => a.position - b.position)
          .map((l) => ({ id: l.id, lineId: l.challan_line_id, damaged: l.damaged, ...qtyFrom(l.head, l.amount) }))
      : [{ id: uuid(), lineId: startLine, damaged: false, ...emptyQty(), head: startLine ? '1' : '' }],
  )
  const [received, setReceived] = useState(sale ? plain(sale.received_now) : '')
  const [receivedIn, setReceivedIn] = useState<Account>(sale?.received_in ?? 'cash')
  const [notes, setNotes] = useState(sale?.notes ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  const total = lines.reduce((sum, l) => sum + (qtyValues(l).total || 0), 0)
  const cost = lines.reduce((sum, l) => {
    const s = view.stats.get(l.lineId)
    const head = qtyValues(l).head
    return sum + (s && head > 0 ? costOf(s.line, head) : 0)
  }, 0)
  // A walk-in customer pays the whole bill there and then.
  const walkIn = customer === ''
  const receivedNow = walkIn ? total : received.trim() === '' ? 0 : toNumber(received)
  const credit = total - (Number.isFinite(receivedNow) ? receivedNow : 0)

  const change = (i: number, next: Draft) => setLines((ls) => ls.map((l, j) => (j === i ? next : l)))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const input = {
      id: sale?.id ?? uuid(),
      sold_on: date,
      customer_id: customer || null,
      received_now: receivedNow,
      received_in: receivedIn,
      notes,
      lines: lines.map((l) => {
        const v = qtyValues(l)
        return { id: l.id, challan_line_id: l.lineId, head: v.head, amount: v.total, damaged: l.damaged }
      }),
    }
    const why = checkSale(view.book, input)
    setProblem(why)
    if (why) return
    try {
      const saved = await save.mutateAsync(input)
      navigate(`/sales/${saved.id}`, { replace: true })
    } catch {
      // Shown above the buttons.
    }
  }

  const failure = problem ?? save.error

  return (
    <form onSubmit={submit} className="space-y-4">
      <PageHeader
        back={
          sale ? { to: `/sales/${sale.id}`, label: t('Sale #{n}', { n: sale.number }) } : { to: '/sales', label: t('Sales') }
        }
        title={sale ? t('Edit sale #{n}', { n: sale.number }) : t('New sale')}
      />

      <Card className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label={t('Customer')}>
          <PartyPicker view={view} kind="customer" value={customer} onChange={setCustomer} walkIn />
        </Field>
        <Field label={t('Date sold')}>
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </Card>

      <section>
        <h2 className="mb-2 px-1 text-[15px] font-semibold">{t('Animals sold')}</h2>
        <Card className="divide-y divide-line-soft">
          {lines.map((l, i) => {
            const s = view.stats.get(l.lineId)
            const v = qtyValues(l)
            const lineCost = s && v.head > 0 ? costOf(s.line, v.head) : null
            return (
              <div key={l.id} className="space-y-3 p-4">
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Field label={t('From which challan')}>
                      <LinePicker
                        view={view}
                        value={l.lineId}
                        onChange={(lineId) => change(i, { ...l, lineId, head: l.head || '1' })}
                        skip={{ saleId: sale?.id }}
                      />
                    </Field>
                  </div>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      aria-label={t('Remove this line')}
                      className="btn-quiet h-12 w-12 px-0"
                      onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    >
                      <X className="h-5 w-5" aria-hidden />
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-[5.5rem_1fr] gap-3 sm:grid-cols-[7rem_1fr_1fr]">
                  <Field label={t('How many')}>
                    <CountInput value={l.head} onChange={(h) => change(i, { ...l, ...setHead(l, h) })} />
                  </Field>
                  <Field label={t('Price each')}>
                    <MoneyInput value={l.each} onChange={(p) => change(i, { ...l, ...setEach(l, p) })} />
                  </Field>
                  <div className="col-span-2 sm:col-span-1">
                    <Field label={t('Total price')}>
                      <MoneyInput value={l.total} onChange={(p) => change(i, { ...l, ...setTotal(l, p) })} />
                    </Field>
                  </div>
                </div>
                <label
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm transition ${
                    l.damaged ? 'bg-bad-wash' : 'bg-sunk/70'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 accent-[var(--color-bad)]"
                    checked={l.damaged}
                    onChange={(e) => change(i, { ...l, damaged: e.target.checked })}
                  />
                  <span>
                    <span className="font-semibold">{t('Damaged')}</span>
                    <span className="text-ink-soft"> · {t('injured or sick, sold cheap')}</span>
                  </span>
                </label>
                {lineCost !== null ? (
                  <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-ink-soft">
                    <span>{t('They cost {amount}', { amount: rs(lineCost) })}</span>
                    {Number.isFinite(v.total) ? <Gain value={v.total - lineCost} /> : null}
                  </p>
                ) : null}
              </div>
            )
          })}
          <div className="p-3">
            <button
              type="button"
              className="btn-soft w-full"
              onClick={() => setLines((ls) => [...ls, { id: uuid(), lineId: '', damaged: false, ...emptyQty() }])}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('Add other animals')}
            </button>
          </div>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-[15px] font-semibold">{t('Payment')}</h2>
        <Card className="space-y-4 p-4">
          <div className="flex items-baseline justify-between gap-3 rounded-xl bg-sunk/70 px-3.5 py-3">
            <span className="font-medium">{t('Sale total')}</span>
            <span className="tnum text-xl font-semibold">{rs(total)}</span>
          </div>
          {walkIn ? (
            <p className="text-sm text-ink-soft">
              {t('A walk-in customer pays the full {amount} now. Pick a customer to sell on credit.', { amount: rs(total) })}
            </p>
          ) : (
            <>
              <Field label={t('Received now')}>
                <MoneyInput value={received} onChange={setReceived} />
              </Field>
              <div className="-mt-1 grid grid-cols-2 gap-2">
                <button type="button" className="btn-ghost" onClick={() => setReceived(plain(total))}>
                  {t('Paid in full')}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setReceived('0')}>
                  {t('All on credit')}
                </button>
              </div>
            </>
          )}
          <div>
            <span className="label">{t('Received in')}</span>
            <AccountPills label={t('Received in')} value={receivedIn} onChange={setReceivedIn} />
          </div>
          <div className="space-y-2 border-t border-line-soft pt-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-ink-soft">{t('On credit')}</span>
              <span className={`tnum font-semibold ${credit > 0.5 ? 'text-owed' : ''}`}>
                {credit > 0.5 ? rs(credit) : t('Nothing')}
              </span>
            </div>
            {credit > 0.5 ? <p className="text-xs text-ink-soft">{t("It goes on the customer's ledger.")}</p> : null}
            {cost > 0 && total > 0 ? (
              <div className="flex justify-between gap-3">
                <span className="text-ink-soft">{t('On this sale')}</span>
                <Gain value={total - cost} />
              </div>
            ) : null}
          </div>
        </Card>
      </section>

      <Card className="p-4">
        <Field label={t('Notes')} hint={t('Optional.')}>
          <textarea className="field min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Card>

      <ActionBar error={failure ? <ErrorNote error={failure} /> : null}>
        <button type="button" className="btn-ghost" onClick={() => navigate(-1)}>
          {t('Cancel')}
        </button>
        <button type="submit" className="btn-primary flex-1 sm:flex-none sm:min-w-40" disabled={save.isPending}>
          {save.isPending ? t('Saving…') : sale ? t('Save changes') : t('Save sale')}
        </button>
      </ActionBar>
    </form>
  )
}
