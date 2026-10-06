import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Tag, Trash2 } from 'lucide-react'
import { Avatar, Badge, Card, ConfirmDialog, Gain, Gate, IconBadge, PageHeader } from '../components/ui'
import { backend } from '../data/backend'
import { useAction, useBooks } from '../data/queries'
import { costOf } from '../lib/books'
import { accountName, count, rs, shortDate } from '../lib/format'
import { t } from '../lib/i18n'

export default function SaleDetail() {
  const { id = '' } = useParams()
  const { view, error } = useBooks()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const remove = useAction(backend.deleteSale)

  if (!view) return <Gate error={error} ready={false} />
  const s = view.saleById.get(id)
  if (!s) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('Sale not found')} back={{ to: '/sales', label: t('Sales') }} />
        <p className="text-sm text-ink-soft">{t('It may have been deleted.')}</p>
      </div>
    )
  }

  const goBack = t('The {animals} go back into stock.', { animals: count(s.head, t('animal'), t('animals')) })
  const money =
    s.credit > 0.5
      ? t("The {amount} credit comes off {name}'s ledger.", {
          amount: rs(s.credit),
          name: s.customer?.name ?? t('Customer'),
        })
      : t('The money comes out of the books.')

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ to: '/sales', label: t('Sales') }}
        title={t('Sale #{n}', { n: s.sale.number })}
        subtitle={shortDate(s.sale.sold_on)}
        corner={
          <Link to={`/sales/${s.sale.id}/edit`} className="btn-ghost min-h-10">
            <Pencil className="h-4 w-4" aria-hidden />
            {t('Edit')}
          </Link>
        }
      />

      {/* Laid out like a bill: who, what, and how it was paid. */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          {s.customer ? <Avatar name={s.customer.name} /> : <IconBadge icon={Tag} />}
          <div className="min-w-0 flex-1">
            {s.customer ? (
              <Link to={`/customers/${s.customer.id}`} className="block truncate font-semibold text-brand-deep">
                {s.customer.name}
              </Link>
            ) : (
              <div className="font-semibold">{t('Walk-in customer')}</div>
            )}
            <div className="text-sm text-ink-soft">{count(s.head, t('animal'), t('animals'))}</div>
          </div>
          {s.credit > 0.5 ? (
            <Badge tone="owed">{t('{amount} on credit', { amount: rs(s.credit) })}</Badge>
          ) : (
            <Badge tone="good">{t('Paid')}</Badge>
          )}
        </div>

        <div className="divide-y divide-line-soft border-t border-line-soft">
          {s.lines.map(({ line, stats }) => (
            <Link
              key={line.id}
              to={stats ? `/challans/${stats.challan.id}` : '#'}
              className="flex items-start justify-between gap-3 px-4 py-3 transition hover:bg-sunk/50"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {line.head} {stats?.line.animal}
                  {line.damaged ? <Badge tone="bad">{t('Damaged')}</Badge> : null}
                </div>
                {stats ? (
                  <div className="mt-0.5 text-[13px] text-ink-soft">
                    {t('From challan #{n}', { n: stats.challan.number })} ·{' '}
                    {t('cost {amount}', { amount: rs(costOf(stats.line, line.head)) })}
                  </div>
                ) : null}
              </div>
              <div className="tnum shrink-0 font-semibold">{rs(line.amount)}</div>
            </Link>
          ))}
        </div>

        <dl className="space-y-2 border-t border-dashed border-line bg-sunk/40 p-4 text-sm">
          <Line label={t('Sale total')} value={rs(s.total)} strong />
          <Line
            label={t('Received now ({account})', { account: accountName(s.sale.received_in) })}
            value={rs(s.sale.received_now)}
          />
          <Line label={t('On credit')} value={s.credit > 0.5 ? rs(s.credit) : t('Nothing')} />
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-4 py-3 text-sm">
          <span className="text-ink-soft">{t('Cost of these animals {amount}', { amount: rs(s.cost) })}</span>
          <Gain value={s.profit} />
        </div>
      </Card>

      {s.credit > 0.5 && s.customer ? (
        <p className="px-1 text-sm text-ink-soft">
          {t("The credit is on the customer's ledger.")}{' '}
          <Link to={`/customers/${s.customer.id}`} className="font-semibold text-brand-deep">
            {t("Open {name}'s ledger", { name: s.customer.name })}
          </Link>
        </p>
      ) : null}

      {s.sale.notes ? (
        <Card className="p-4 text-sm">
          <h2 className="text-[15px] font-semibold">{t('Notes')}</h2>
          <p className="mt-1 whitespace-pre-wrap text-ink-soft">{s.sale.notes}</p>
        </Card>
      ) : null}

      <button type="button" className="btn-quiet w-full text-bad hover:text-bad" onClick={() => setConfirming(true)}>
        <Trash2 className="h-4 w-4" aria-hidden />
        {t('Delete this sale')}
      </button>

      <ConfirmDialog
        open={confirming}
        title={t('Delete sale #{n}?', { n: s.sale.number })}
        message={`${goBack} ${money}`}
        busy={remove.isPending}
        error={remove.error}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(s.sale.id)
            navigate('/sales', { replace: true })
          } catch {
            // Shown in the dialog.
          }
        }}
      />
    </div>
  )
}

function Line({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'font-semibold' : 'text-ink-soft'}>{label}</dt>
      <dd className={`tnum font-semibold ${strong ? 'text-base' : ''}`}>{value}</dd>
    </div>
  )
}
