import { useState } from 'react'
import type { Derived } from '../lib/books'
import { rs, shortDate } from '../lib/format'
import { t } from '../lib/i18n'
import { available } from '../lib/rules'
import type { Account, PartyKind } from '../lib/types'
import { PartyForm } from './forms'
import { Pills } from './ui'

const NEW = '__new'

/** Pick a customer or supplier, or add a new one without leaving the form. */
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
  const [adding, setAdding] = useState(false)
  const list = [...(kind === 'customer' ? view.book.customers : view.book.suppliers)].sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  return (
    <>
      <select
        className="field"
        value={value}
        onChange={(e) => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))}
      >
        {walkIn ? (
          <option value="">{t('Walk-in customer (pays in full)')}</option>
        ) : (
          <option value="" disabled>
            {kind === 'customer' ? t('Pick a customer…') : t('Pick a supplier…')}
          </option>
        )}
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value={NEW}>{kind === 'customer' ? t('+ Add a new customer…') : t('+ Add a new supplier…')}</option>
      </select>
      <PartyForm
        kind={kind}
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(id) => {
          setAdding(false)
          onChange(id)
        }}
      />
    </>
  )
}

/**
 * Pick animals still in hand, grouped by challan: "#3 Goat — 16 left · cost
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
  const groups = view.challans
    .map((c) => ({
      c,
      lines: c.lines
        .map((s) => ({ s, left: available(view.book, s.line.id, skip) }))
        .filter(({ s, left }) => left > 0 || s.line.id === value),
    }))
    .filter((g) => g.lines.length > 0)
  return (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>
        {groups.length ? t('Pick the animals…') : t('No animals in stock')}
      </option>
      {groups.map(({ c, lines }) => (
        <optgroup
          key={c.challan.id}
          label={t('Challan #{n} · {supplier} · {date}', {
            n: c.challan.number,
            supplier: c.supplier?.name ?? t('Supplier'),
            date: shortDate(c.challan.bought_on),
          })}
        >
          {lines.map(({ s, left }) => (
            // The challan number again: a closed picker on a phone shows only the chosen option.
            <option key={s.line.id} value={s.line.id}>
              {t('#{n} {animal} — {left} left · cost {each} each', {
                n: c.challan.number,
                animal: s.line.animal,
                left,
                each: rs(s.each),
              })}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
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
