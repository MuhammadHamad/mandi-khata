import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronDown, Plus, Search } from 'lucide-react'
import { t } from '../lib/i18n'
import { Modal } from './ui'

/** One choice in a SearchPicker. */
export type PickItem = {
  /** The value handed back; '' for a "none of these" choice such as a walk-in customer. */
  id: string
  title: string
  sub?: string
  leading?: ReactNode
  right?: ReactNode
  rightSub?: ReactNode
  /** The heading it sits under, such as its challan. Items come grouped in the order given. */
  group?: string
  /** What the closed box says once it is picked; its title when left out. */
  label?: string
  /** Searched as well as the title and sub, such as "#3" or a phone number's digits. */
  words?: string
  /** Kept at the top and shown whatever is searched. */
  pinned?: boolean
}

/**
 * A choice from a list that keeps growing, such as customers or challans. The phone's own
 * picker can't search, so this one opens a sheet with a search box over the list. It looks
 * like the other boxes in a form, and the sheet stands clear of the form it sits in.
 */
export function SearchPicker({
  value,
  onChange,
  items,
  title,
  placeholder,
  searchPlaceholder,
  emptyText,
  action,
}: {
  value: string
  onChange: (id: string) => void
  items: PickItem[]
  /** The sheet's heading, such as "Pick a customer". */
  title: string
  /** The closed box when nothing is picked. */
  placeholder: string
  searchPlaceholder: string
  /** Shown when there is nothing to pick from at all. */
  emptyText: string
  /** A button under the search box, such as adding a new customer. It gets whatever was typed. */
  action?: { label: (typed: string) => string; onClick: (typed: string) => void }
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLButtonElement>(null)
  const chosen = items.find((i) => i.id === value)
  const typed = query.trim()
  const q = typed.toLowerCase()
  const shown = q
    ? items.filter((i) => i.pinned || `${i.title} ${i.sub ?? ''} ${i.words ?? ''}`.toLowerCase().includes(q))
    : items
  const matches = shown.filter((i) => !i.pinned).length
  // A keyboard on a phone would hide half the list, so only a mouse gets the search box ready.
  const finePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches

  const close = () => {
    setOpen(false)
    setQuery('')
    box.current?.focus()
  }
  const pick = (id: string) => {
    onChange(id)
    close()
  }

  // Groups in the order their items come, pinned choices first and under no heading.
  const groups: { name: string | undefined; items: PickItem[] }[] = []
  for (const item of shown) {
    const name = item.pinned ? undefined : item.group
    const last = groups[groups.length - 1]
    if (last && last.name === name) last.items.push(item)
    else groups.push({ name, items: [item] })
  }

  return (
    <>
      <button
        ref={box}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="field flex items-center justify-between gap-2 text-left"
      >
        <span className={`min-w-0 truncate ${chosen ? '' : 'text-ink-faint'}`}>
          {chosen ? (chosen.label ?? chosen.title) : placeholder}
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden />
      </button>

      <Modal open={open} onClose={close} title={title} tall>
        <div className="sticky top-0 z-10 -mx-5 space-y-2 bg-paper px-5 pb-3">
          <label className="relative block">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <input
              type="search"
              className="field pl-10"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              autoFocus={finePointer}
              autoComplete="off"
            />
          </label>
          {action ? (
            <button
              type="button"
              className="btn-soft w-full justify-start"
              onClick={() => {
                close()
                action.onClick(typed)
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span className="min-w-0 truncate">{action.label(typed)}</span>
            </button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-soft">{emptyText}</p>
        ) : (
          <div className="space-y-4 pb-2">
            {groups.map((g, gi) => (
              <section key={`${g.name ?? 'top'}:${gi}`}>
                {g.name ? <h3 className="mb-1.5 px-1 text-[13px] font-semibold text-ink-soft">{g.name}</h3> : null}
                <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line-soft">
                  {g.items.map((item) => {
                    const on = item.id === value
                    return (
                      <li key={item.id || 'none'}>
                        <button
                          type="button"
                          aria-current={on ? 'true' : undefined}
                          onClick={() => pick(item.id)}
                          className={`flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-sunk/50 active:bg-sunk ${
                            on ? 'bg-brand-wash/60' : ''
                          }`}
                        >
                          {item.leading}
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 font-medium break-words">{item.title}</span>
                            {item.sub ? (
                              <span className="mt-0.5 block truncate text-[13px] text-ink-soft">{item.sub}</span>
                            ) : null}
                          </span>
                          {item.right !== undefined || item.rightSub ? (
                            <span className="shrink-0 text-right">
                              <span className="tnum block text-sm font-semibold">{item.right}</span>
                              {item.rightSub ? <span className="block text-xs">{item.rightSub}</span> : null}
                            </span>
                          ) : null}
                          {on ? <Check className="h-5 w-5 shrink-0 text-brand" aria-hidden /> : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
            {q && matches === 0 ? (
              <p className="py-6 text-center text-sm text-ink-soft">{t('Nothing matches “{typed}”', { typed })}</p>
            ) : null}
          </div>
        )}
      </Modal>
    </>
  )
}
