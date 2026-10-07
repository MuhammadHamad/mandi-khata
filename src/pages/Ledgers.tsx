import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, BookUser, Plus, Search } from 'lucide-react'
import { PartyForm } from '../components/forms'
import { Avatar, Empty, Gate, PageHeader, Row, Section, TabCards } from '../components/ui'
import type { Tone } from '../components/ui'
import { useBooks } from '../data/queries'
import { rs } from '../lib/format'
import { t } from '../lib/i18n'
import type { PartyKind } from '../lib/types'

export default function Ledgers() {
  const { view, error } = useBooks()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const kind: PartyKind = params.get('tab') === 'suppliers' ? 'supplier' : 'customer'
  if (!view) return <Gate error={error} ready={false} />

  const customers = kind === 'customer'
  const balances = customers ? view.balances.customers : view.balances.suppliers
  const parties = (customers ? view.book.customers : view.book.suppliers)
    .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .map((p) => ({ p, balance: balances.get(p.id) ?? 0 }))
    .sort((a, b) => b.balance - a.balance || a.p.name.localeCompare(b.p.name))

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('Ledgers')}
        actions={
          <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {customers ? t('New customer') : t('New supplier')}
          </button>
        }
      />
      <TabCards
        label={t('Customers or suppliers')}
        value={kind}
        onChange={(k) => setParams(k === 'supplier' ? { tab: 'suppliers' } : {}, { replace: true })}
        className="sm:max-w-xl"
        options={[
          {
            value: 'customer',
            title: t('Customers'),
            icon: ArrowDownLeft,
            tone: 'good',
            figure: rs(view.balances.receivable),
            caption: t('Customers owe you'),
          },
          {
            value: 'supplier',
            title: t('Suppliers'),
            icon: ArrowUpRight,
            tone: 'owed',
            figure: rs(view.balances.payable),
            caption: t('You owe suppliers'),
          },
        ]}
      />
      <label className="relative block sm:max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input
          className="field pl-10"
          placeholder={customers ? t('Find a customer') : t('Find a supplier')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={customers ? t('Find a customer') : t('Find a supplier')}
        />
      </label>
      <Section>
        {parties.length === 0 ? (
          <Empty icon={BookUser} title={search ? t('Nobody matches') : customers ? t('No customers yet') : t('No suppliers yet')}>
            {search
              ? null
              : customers
                ? t('They are added from a sale, or with New customer.')
                : t('They are added from a challan, or with New supplier.')}
          </Empty>
        ) : (
          parties.map(({ p, balance }) => (
            <Row
              key={p.id}
              to={`/${kind}s/${p.id}`}
              leading={<Avatar name={p.name} />}
              title={p.name}
              sub={p.phone ?? undefined}
              right={Math.abs(balance) < 0.5 ? '—' : rs(Math.abs(balance))}
              rightSub={<span className={`font-medium ${TEXT[balanceTone(kind, balance)]}`}>{balanceWord(kind, balance)}</span>}
            />
          ))
        )}
      </Section>
      <PartyForm kind={kind} open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

const TEXT: Record<Tone, string> = {
  neutral: 'text-ink-soft',
  brand: 'text-brand-deep',
  good: 'text-good',
  bad: 'text-bad',
  owed: 'text-owed',
  bank: 'text-bank',
}

/** What a balance means, in words: "owes you", "you owe", "advance", "settled". */
export function balanceWord(kind: PartyKind, balance: number): string {
  if (Math.abs(balance) < 0.5) return t('Settled')
  if (kind === 'customer') return balance > 0 ? t('Owes you') : t('Paid in advance')
  return balance > 0 ? t('You owe') : t('You paid in advance')
}

/** Money coming to you is green; money you owe is amber; an advance is blue; settled is plain. */
export function balanceTone(kind: PartyKind, balance: number): Tone {
  if (Math.abs(balance) < 0.5) return 'neutral'
  if (balance < 0) return 'bank'
  return kind === 'customer' ? 'good' : 'owed'
}
