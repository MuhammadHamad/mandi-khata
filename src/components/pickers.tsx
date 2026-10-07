import { useState } from 'react'
import { Tag } from 'lucide-react'
import { TONE_TEXT, balanceTone, balanceWord } from '../lib/balance'
import type { Derived } from '../lib/books'
import { rs, shortDate } from '../lib/format'
import { t } from '../lib/i18n'
import { available } from '../lib/rules'
import type { Account, Book, PartyKind } from '../lib/types'
import { PartyForm } from './forms'
import { SearchPicker } from './SearchPicker'
import type { PickItem } from './SearchPicker'
import { Avatar, IconBadge, Pills } from './ui'

/** The last day each customer or supplier was dealt with, so the latest come first. */
function lastDealings(book: Book, kind: PartyKind): Map<string, string> {
  const last = new Map<string, string>()
  const note = (id: string | null, day: string) => {
    if (id && day > (last.get(id) ?? '')) last.set(id, day)
  }
  if (kind === 'customer') for (const s of book.sales) note(s.customer_id, s.sold_on)
  else for (const c of book.challans) note(c.supplier_id, c.bought_on)
  for (const p of book.payments) note(kind === 'customer' ? p.customer_id : p.supplier_id, p.paid_on)
  return last
}

/**
 * Pick a customer or supplier: the latest dealt with first, each with what they owe or
 * are owed, found by name or phone. A new one can be added without leaving the form,
 * starting from the name already typed.
 */
export function PartyPicker({
  view,
  kind,
  value,
  onChange,
  walkIn = false,
}: {
  view: Derived
  kind: PartyKind
  value: string
  onChange: (id: string) => void
  /** Offer "walk-in customer" as the empty choice. */
  walkIn?: boolean
}) {
  const [adding, setAdding] = useState<string | null>(null)
  const customer = kind === 'customer'
  const balances = customer ? view.balances.customers : view.balances.suppliers
  const last = lastDealings(view.book, kind)
  const list = [...(customer ? view.book.customers : view.book.suppliers)].sort(
    (a, b) => (last.get(b.id) ?? '').localeCompare(last.get(a.id) ?? '') || a.name.localeCompare(b.name),
  )
  const items: PickItem[] = [
    ...(walkIn
      ? [{ id: '', title: t('Walk-in customer (pays in full)'), pinned: true, leading: <IconBadge icon={Tag} /> }]
      : []),
    ...list.map((p) => {
      const balance = balances.get(p.id) ?? 0
      return {
        id: p.id,
        title: p.name,
        sub: p.phone ?? undefined,
        words: p.phone?.replace(/\D/g, ''),
        leading: <Avatar name={p.name} />,
        right: Math.abs(balance) < 0.5 ? '—' : rs(Math.abs(balance)),
        rightSub: <span className={TONE_TEXT[balanceTone(kind, balance)]}>{balanceWord(kind, balance)}</span>,
      }
    }),
  ]
  return (
    <>
      <SearchPicker
        value={value}
        onChange={onChange}
        items={items}
        title={customer ? t('Pick a customer') : t('Pick a supplier')}
        placeholder={customer ? t('Pick a customer…') : t('Pick a supplier…')}
        searchPlaceholder={t('Search by name or phone')}
        emptyText={customer ? t('No customers yet') : t('No suppliers yet')}
        action={{
          label: (typed) =>
            typed
              ? customer
                ? t('Add “{name}” as a new customer', { name: typed })
                : t('Add “{name}” as a new supplier', { name: typed })
              : customer
                ? t('New customer')
                : t('New supplier'),
          onClick: (typed) => setAdding(typed),
        }}
      />
      <PartyForm
        kind={kind}
        name={adding ?? undefined}
        open={adding !== null}
        onClose={() => setAdding(null)}
        onSaved={(id) => {
          setAdding(null)
          onChange(id)
        }}
      />
    </>
  )
}

/**
 * Pick animals still in hand, under their challan, newest challan first. Found by animal,
 * supplier or challan number; once picked the box reads "#3 Goat — 16 left · cost
 * Rs 55,000 each". `skip` counts a sale or death being edited as not yet made.
 */
export function LinePicker({
  view,
  value,
  onChange,
  skip,
}: {
  view: Derived
  value: string
  onChange: (lineId: string) => void
  skip?: { saleId?: string; deathId?: string }
}) {
  const items: PickItem[] = []
  for (const c of [...view.challans].sort((a, b) => b.challan.number - a.challan.number)) {
    const supplier = c.supplier?.name ?? t('Supplier')
    for (const s of c.lines) {
      const left = available(view.book, s.line.id, skip)
      if (left <= 0 && s.line.id !== value) continue
      items.push({
        id: s.line.id,
        group: t('Challan #{n} · {supplier} · {date}', {
          n: c.challan.number,
          supplier,
          date: shortDate(c.challan.bought_on),
        }),
        title: s.line.animal,
        sub: t('{amount} each', { amount: rs(s.each) }),
        right: t('{n} left', { n: left }),
        words: `#${c.challan.number} ${supplier}`,
        // The challan number again: the closed box shows only the chosen one.
        label: t('#{n} {animal} — {left} left · cost {each} each', {
          n: c.challan.number,
          animal: s.line.animal,
          left,
          each: rs(s.each),
        }),
      })
    }
  }
  return (
    <SearchPicker
      value={value}
      onChange={onChange}
      items={items}
      title={t('Which animals')}
      placeholder={items.length ? t('Pick the animals…') : t('No animals in stock')}
      searchPlaceholder={t('Search by animal, supplier or challan')}
      emptyText={t('No animals in stock')}
    />
  )
}

/** The first line with animals left, for a form opened from one challan. */
export function firstOpenLine(view: Derived, challanId: string | null): string {
  if (!challanId) return ''
  const c = view.challanById.get(challanId)
  return c?.lines.find((s) => available(view.book, s.line.id) > 0)?.line.id ?? ''
}

export function AccountPills({
  value,
  onChange,
  label,
}: {
  value: Account
  onChange: (value: Account) => void
  label: string
}) {
  return (
    <Pills
      label={label}
      value={value}
      onChange={onChange}
      options={[
        { value: 'cash', label: t('Cash') },
        { value: 'bank', label: t('Bank') },
      ]}
    />
  )
}
