import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { t } from '../lib/i18n'

/**
 * A text box with its own list of suggestions: type anything, or pick from the list.
 * The browser's own suggestion list (`datalist`) shows once on Android and then won't
 * come back, so this one is drawn by the app: the arrow and a tap on the box open it
 * every time, typing narrows it, and a tap outside or Escape closes it.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  autoFocus = false,
}: {
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  placeholder?: string
  autoFocus?: boolean
}) {
  const [open, setOpen] = useState(false)
  // Opened with the arrow or a tap: every choice. Opened by typing: only those that match.
  const [everything, setEverything] = useState(true)
  const [active, setActive] = useState(-1)
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()
  const typed = value.trim().toLowerCase()
  const shown = everything || !typed ? options : options.filter((o) => o.toLowerCase().includes(typed))
  // What counts is whether a list is on screen: typed words that match nothing leave none.
  const visible = open && shown.length > 0

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const show = (all: boolean) => {
    setEverything(all)
    setActive(-1)
    setOpen(true)
  }
  const choose = (option: string) => {
    onChange(option)
    setOpen(false)
    setActive(-1)
  }

  return (
    <div
      ref={root}
      className="relative"
      onBlur={(e) => {
        // Tabbing away closes it; moving within (to the arrow) does not.
        if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <input
        className="field pr-12"
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          show(false)
        }}
        onClick={() => {
          if (!visible) show(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (!visible) show(true)
            else setActive((i) => Math.min(i + 1, shown.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' && visible && shown[active]) {
            e.preventDefault()
            choose(shown[active])
          } else if (e.key === 'Escape' && visible) {
            // Close only the list, not the sheet it sits in.
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
          }
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={visible ? t('Close the list') : t('Show the list')}
        aria-expanded={visible}
        aria-controls={listId}
        // Leaves focus where it was, so the tap toggles the list and nothing else (Safari would blur the box).
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (visible ? setOpen(false) : show(true))}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-ink-soft transition hover:text-ink"
      >
        <ChevronDown className={`h-5 w-5 transition ${visible ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {visible ? (
        <ul
          id={listId}
          role="listbox"
          // Keeps the typing box focused while a choice is tapped.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto overscroll-contain rounded-xl border border-line bg-paper py-1 shadow-lg"
        >
          {shown.map((option, i) => {
            const chosen = option.toLowerCase() === typed
            return (
              <li
                key={option}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={chosen}
                onClick={(e) => {
                  // The box sits inside a <label>; this stops the label passing the tap on to it.
                  e.preventDefault()
                  choose(option)
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3.5 text-base ${
                  i === active ? 'bg-sunk' : ''
                } ${chosen ? 'font-semibold' : ''}`}
              >
                <span className="min-w-0 truncate">{option}</span>
                {chosen ? <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden /> : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
