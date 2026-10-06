import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { AccountPills, PartyPicker } from '../components/pickers'
import { emptyQty, qtyFrom, qtyValues, setEach, setHead, setTotal } from '../components/qty'
import type { Qty } from '../components/qty'
import { ActionBar, Card, CountInput, ErrorNote, Field, Gate, MoneyInput, PageHeader } from '../components/ui'
import { backend } from '../data/backend'
import { useAction, useBooks } from '../data/queries'
import { animalKinds } from '../lib/books'
import type { Derived } from '../lib/books'
import { plain, rs, todayISO, toNumber } from '../lib/format'
import { t } from '../lib/i18n'
import { uuid } from '../lib/ids'
import { checkChallan } from '../lib/rules'
import type { Account, Challan } from '../lib/types'

type Draft = Qty & { id: string; animal: string }

export default function ChallanForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { view, error } = useBooks()
  if (!view) return <Gate error={error} ready={false} />
  const challan = id ? view.book.challans.find((c) => c.id === id) : undefined
  if (id && !challan) {
    return <PageHeader title={t('Challan not found')} back={{ to: '/challans', label: t('Challans') }} />
  }
  return <Editor key={id ?? 'new'} view={view} challan={challan} supplierId={params.get('supplier') ?? ''} />
}

function Editor({ view, challan, supplierId }: { view: Derived; challan?: Challan; supplierId: string }) {
  const navigate = useNavigate()
  const save = useAction(backend.saveChallan)
  const [supplier, setSupplier] = useState(challan?.supplier_id ?? supplierId)
  const [date, setDate] = useState(challan?.bought_on ?? todayISO())
  const [lines, setLines] = useState<Draft[]>(() =>
    challan
      ? view.book.challanLines
          .filter((l) => l.challan_id === challan.id)
          .sort((a, b) => a.position - b.position)
          .map((l) => ({ id: l.id, animal: l.animal, ...qtyFrom(l.head, l.cost) }))
      : [{ id: uuid(), animal: '', ...emptyQty() }],
  )
  const [paid, setPaid] = useState(challan ? plain(challan.paid_now) : '')
  const [paidFrom, setPaidFrom] = useState<Account>(challan?.paid_from ?? 'cash')
  const [notes, setNotes] = useState(challan?.notes ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  const total = lines.reduce((sum, l) => sum + (qtyValues(l).total || 0), 0)
  const paidNow = paid.trim() === '' ? 0 : toNumber(paid)
  const credit = total - (Number.isFinite(paidNow) ? paidNow : 0)
  const kinds = animalKinds(view.book.challanLines)

  const change = (i: number, next: Draft) => setLines((ls) => ls.map((l, j) => (j === i ? next : l)))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const input = {
      id: challan?.id ?? uuid(),
      supplier_id: supplier,
      bought_on: date,
      paid_now: paidNow,
      paid_from: paidFrom,
      notes,
      lines: lines.map((l) => {
        const v = qtyValues(l)
        return { id: l.id, animal: l.animal, head: v.head, cost: v.total }
      }),
    }
    const why = checkChallan(view.book, input)
    setProblem(why)
    if (why) return
    try {
      const saved = await save.mutateAsync(input)
      navigate(`/challans/${saved.id}`, { replace: true })
    } catch {
      // Shown above the buttons.
    }
  }

  const failure = problem ?? save.error

  return (
    <form onSubmit={submit} className="space-y-4">
      <PageHeader
        back={
          challan
            ? { to: `/challans/${challan.id}`, label: t('Challan #{n}', { n: challan.number }) }
            : { to: '/challans', label: t('Challans') }
        }
        title={challan ? t('Edit challan #{n}', { n: challan.number }) : t('New challan')}
        subtitle={t('One bulk purchase of animals.')}
      />

      <Card className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label={t('Supplier')}>
          <PartyPicker view={view} kind="supplier" value={supplier} onChange={setSupplier} />
        </Field>
        <Field label={t('Date bought')}>
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </Card>

      <section>
        <h2 className="mb-2 px-1 text-[15px] font-semibold">{t('Animals')}</h2>
        <datalist id="animal-kinds">
          {kinds.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <Card className="divide-y divide-line-soft">
          {lines.map((l, i) => {
            // Animals already sold or dead from a saved line: it must stay, at least that big.
            const saved = view.stats.get(l.id)
            const used = saved ? saved.sold + saved.died : 0
            return (
              <div key={l.id} className="space-y-3 p-4">
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Field label={t('Kind of animal')}>
                      <input
                        className="field"
                        list="animal-kinds"
                        placeholder={t('Goat, sheep, cow…')}
                        value={l.animal}
                        onChange={(e) => change(i, { ...l, animal: e.target.value })}
                      />
                    </Field>
                  </div>
                  {lines.length > 1 && !used ? (
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
                    <CountInput value={l.head} onChange={(v) => change(i, { ...l, ...setHead(l, v) })} />
                  </Field>
                  <Field label={t('Price each')}>
                    <MoneyInput value={l.each} onChange={(v) => change(i, { ...l, ...setEach(l, v) })} />
                  </Field>
                  <div className="col-span-2 sm:col-span-1">
                    <Field label={t('Total cost')}>
                      <MoneyInput value={l.total} onChange={(v) => change(i, { ...l, ...setTotal(l, v) })} />
                    </Field>
                  </div>
                </div>
                {used ? (
                  <p className="text-xs text-ink-soft">
                    {t("{n} already sold or dead, so this line stays and its count can't go below {n}.", { n: used })}
                  </p>
                ) : null}
              </div>
            )
          })}
          <div className="p-3">
            <button
              type="button"
              className="btn-soft w-full"
              onClick={() => setLines((ls) => [...ls, { id: uuid(), animal: '', ...emptyQty() }])}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('Add another kind of animal')}
            </button>
          </div>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-[15px] font-semibold">{t('Payment to the supplier')}</h2>
        <Card className="space-y-4 p-4">
          <div className="flex items-baseline justify-between gap-3 rounded-xl bg-sunk/70 px-3.5 py-3">
            <span className="font-medium">{t('Challan total')}</span>
            <span className="tnum text-xl font-semibold">{rs(total)}</span>
          </div>
          <Field label={t('Paid now')}>
            <MoneyInput value={paid} onChange={setPaid} />
          </Field>
          <div className="-mt-1 grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost" onClick={() => setPaid(plain(total))}>
              {t('Paid in full')}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setPaid('0')}>
              {t('Nothing yet')}
            </button>
          </div>
          <div>
            <span className="label">{t('Paid from')}</span>
            <AccountPills label={t('Paid from')} value={paidFrom} onChange={setPaidFrom} />
          </div>
          <p className={`text-sm font-medium ${credit > 0.5 ? 'text-owed' : 'text-ink-soft'}`}>
            {credit > 0.5
              ? t("{amount} stays on credit, on the supplier's ledger.", { amount: rs(credit) })
              : t('Nothing left on credit.')}
          </p>
        </Card>
      </section>

      <Card className="p-4">
        <Field label={t('Notes')} hint={t('Optional. A paper challan number, the truck, anything worth keeping.')}>
          <textarea className="field min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Card>

      <ActionBar error={failure ? <ErrorNote error={failure} /> : null}>
        <button type="button" className="btn-ghost" onClick={() => navigate(-1)}>
          {t('Cancel')}
        </button>
        <button type="submit" className="btn-primary flex-1 sm:flex-none sm:min-w-40" disabled={save.isPending}>
          {save.isPending ? t('Saving…') : challan ? t('Save changes') : t('Save challan')}
        </button>
      </ActionBar>
    </form>
  )
}
