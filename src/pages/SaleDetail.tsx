import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { Badge, Card, ConfirmDialog, Gain, Gate, PageHeader, Row, Section } from '../components/ui'
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
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/sales', label: t('Sales') }}
        title={t('Sale #{n}', { n: s.sale.number })}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {s.customer ? (
              <Link to={`/customers/${s.customer.id}`} className="font-medium text-brand-deep">
                {s.customer.name}
              </Link>
            ) : (
              <span>{t('Walk-in customer')}</span>
            )}
            <span>· {shortDate(s.sale.sold_on)}</span>
            {s.credit > 0.5 ? (
              <Badge tone="owed">{t('{amount} on credit', { amount: rs(s.credit) })}</Badge>
            ) : (
              <Badge tone="good">{t('Paid')}</Badge>
            )}
          </span>
        }
        actions={
          <>
            <Link to={`/sales/${s.sale.id}/edit`} className="btn-ghost">
              <Pencil className="h-4 w-4" aria-hidden />
              {t('Edit')}
            </Link>
            <button type="button" className="btn-ghost" onClick={() => setConfirming(true)}>
              <Trash2 className="h-4 w-4" aria-hidden />
              {t('Delete')}
            </button>
          </>
        }
      />

      <Section title={t('Animals')}>
        {s.lines.map(({ line, stats }) => (
          <Row
            key={line.id}
            to={stats ? `/challans/${stats.challan.id}` : undefined}
            title={
              <span className="flex items-center gap-2">
                {line.head} {stats?.line.animal}
                {line.damaged ? <Badge tone="bad">{t('Damaged')}</Badge> : null}
              </span>
            }
            sub={stats ? t('From challan #{n}', { n: stats.challan.number }) : undefined}
            right={rs(line.amount)}
            rightSub={stats ? t('cost {amount}', { amount: rs(costOf(stats.line, line.head)) }) : undefined}
          />
        ))}
      </Section>

      <Card className="space-y-2 p-4 text-sm">
        <Line label={t('Sale total')} value={rs(s.total)} strong />
        <Line
          label={t('Received now ({account})', { account: accountName(s.sale.received_in) })}
          value={rs(s.sale.received_now)}
        />
        <Line label={t('On credit')} value={s.credit > 0.5 ? rs(s.credit) : t('Nothing')} />
        <div className="border-t border-line-soft pt-2">
          <Line label={t('Cost of these animals {amount}', { amount: rs(s.cost) })} value={<Gain value={s.profit} />} />
        </div>
        {s.credit > 0.5 && s.customer ? (
          <p className="text-xs text-ink-soft">
            {t("The credit is on the customer's ledger.")}{' '}
            <Link to={`/customers/${s.customer.id}`} className="font-medium text-brand-deep">
              {t("Open {name}'s ledger", { name: s.customer.name })}
            </Link>
          </p>
        ) : null}
      </Card>

      {s.sale.notes ? (
        <Card className="p-4 text-sm">
          <h2 className="font-sans text-sm font-semibold text-ink-soft">{t('Notes')}</h2>
          <p className="mt-1 whitespace-pre-wrap">{s.sale.notes}</p>
        </Card>
      ) : null}

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
      <span className={strong ? 'font-semibold' : 'text-ink-soft'}>{label}</span>
      <span className={`tnum ${strong ? 'text-base font-semibold' : ''}`}>{value}</span>
    </div>
  )
}
