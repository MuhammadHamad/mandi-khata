import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, TrendingDown, TrendingUp, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { inWords, rs, toNumber } from '../lib/format'
import { t } from '../lib/i18n'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>
}

/**
 * A page's way back, its title, a quiet line under it, and its main actions.
 * `corner` sits top right, level with the way back: for Edit on a record.
 */
export function PageHeader({
  title,
  subtitle,
  back,
  corner,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: { to: string; label: string }
  corner?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-5">
      {back || corner ? (
        <div className="mb-2 flex min-h-10 items-center justify-between gap-3">
          {back ? (
            <Link
              to={back.to}
              className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm font-medium text-ink-soft transition hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {back.label}
            </Link>
          ) : (
            <span />
          )}
          {corner}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <div className="mt-1 text-sm text-ink-soft">{subtitle}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

// ------------------------------------------------------------ pictures --

export const TONES = {
  neutral: 'bg-sunk text-ink-soft',
  brand: 'bg-brand-wash text-brand-deep',
  good: 'bg-good-wash text-good',
  bad: 'bg-bad-wash text-bad',
  owed: 'bg-owed-wash text-owed',
  bank: 'bg-bank-wash text-bank',
} as const
export type Tone = keyof typeof TONES

/** An icon on a soft tint: the picture that tells a row or a figure apart before the words do. */
export function IconBadge({
  icon: Icon,
  tone = 'neutral',
  size = 'md',
}: {
  icon: LucideIcon
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
}) {
  const box = size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'lg' ? 'h-12 w-12 rounded-2xl' : 'h-10 w-10 rounded-xl'
  const glyph = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'
  return (
    <span className={`flex shrink-0 items-center justify-center ${box} ${TONES[tone]}`}>
      <Icon className={glyph} aria-hidden />
    </span>
  )
}

/** "#3" on a tint: a challan's number as its picture. */
export function NumberBadge({ n }: { n: number }) {
  return (
    <span className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-brand-wash px-1.5 text-sm font-semibold text-brand-deep">
      #{n}
    </span>
  )
}

/** "BM" for Bilal Meat Shop. Words in brackets, often a place, are left out. */
export function initials(name: string): string {
  const words = name.replace(/\(.*?\)/g, ' ').trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?'
}

const PEOPLE: Tone[] = ['brand', 'bank', 'owed', 'good']

/** A person's initials in a circle, tinted the same way every time so faces become familiar. */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const tone = PEOPLE[hash % PEOPLE.length]
  const box = size === 'lg' ? 'h-14 w-14 text-lg' : 'h-10 w-10 text-sm'
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${box} ${TONES[tone]}`}>
      {initials(name)}
    </span>
  )
}

// ------------------------------------------------------------- figures --

/** The big green money card: one amount in large type, and the amounts that sit beside it underneath. */
export function MoneyCard({
  label,
  icon: Icon,
  value,
  parts,
}: {
  label: string
  icon: LucideIcon
  value: number
  parts: { label: string; value: number; icon?: LucideIcon }[]
}) {
  return (
    <div className="rounded-[1.5rem] bg-hero p-5 text-white shadow-lg shadow-hero/25">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-white/80">{label}</span>
        <Icon className="h-5 w-5 text-white/70" aria-hidden />
      </div>
      <div className="tnum mt-1.5 text-[2.5rem] leading-none font-semibold tracking-tight sm:text-5xl">{rs(value)}</div>
      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/15 pt-4">
        {parts.map(({ label: partLabel, value: partValue, icon: PartIcon }) => (
          <div key={partLabel} className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-white/70">
              {PartIcon ? <PartIcon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              {partLabel}
            </div>
            <div className="tnum mt-0.5 text-lg font-semibold sm:text-xl">{rs(partValue)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * One figure at a glance, with its picture. The value keeps the page's own
 * ink; any judgement on it (profit or loss) sits under it as `status`.
 */
export function Stat({
  label,
  value,
  icon,
  tone = 'neutral',
  status,
  detail,
  to,
}: {
  label: string
  value: string
  icon?: LucideIcon
  tone?: Tone
  status?: ReactNode
  detail?: ReactNode
  to?: string
}) {
  const body = (
    <>
      <div className="flex items-start gap-2.5">
        {icon ? <IconBadge icon={icon} tone={tone} size="sm" /> : null}
        <div className={`min-w-0 text-[13px] leading-snug font-medium text-ink-soft ${icon ? 'pt-0.5' : ''}`}>{label}</div>
      </div>
      <div className="mt-2 text-xl leading-tight font-semibold tracking-tight sm:text-2xl">{value}</div>
      {status ? <div className="mt-1 text-sm">{status}</div> : null}
      {detail ? <div className="mt-1 text-xs text-ink-soft">{detail}</div> : null}
    </>
  )
  const cls = 'card block p-4'
  return to ? (
    <Link to={to} className={`${cls} transition hover:shadow-md active:scale-[0.99]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function gainWord(loss: boolean, soFar: boolean): string {
  if (soFar) return loss ? t('Loss so far') : t('Profit so far')
  return loss ? t('Loss') : t('Profit')
}

/** Profit or loss, with an arrow and the word as well as the colour. `soFar` for a challan still selling. */
export function Gain({ value, soFar = false, amount = true }: { value: number; soFar?: boolean; amount?: boolean }) {
  const loss = value < -0.5
  const Icon = loss ? TrendingDown : TrendingUp
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className={`inline-flex items-center gap-1 font-semibold ${loss ? 'text-bad' : 'text-good'}`}>
        <Icon className="h-4 w-4" aria-hidden />
        {gainWord(loss, soFar)}
      </span>
      {amount ? <span className="tnum font-semibold text-ink">{rs(Math.abs(value))}</span> : null}
    </span>
  )
}

/** Profit or loss for the right side of a Row: arrow and amount on top, the word under it. */
export function gainParts(value: number, soFar = false): { right: ReactNode; rightSub: ReactNode } {
  const loss = value < -0.5
  const Icon = loss ? TrendingDown : TrendingUp
  return {
    right: (
      <span className="inline-flex items-center gap-1">
        <Icon className={`h-4 w-4 ${loss ? 'text-bad' : 'text-good'}`} aria-hidden />
        {rs(Math.abs(value))}
      </span>
    ),
    rightSub: <span className={`font-medium ${loss ? 'text-bad' : 'text-good'}`}>{gainWord(loss, soFar)}</span>,
  }
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  )
}

/**
 * Sold, died and left as one bar: green for sold, red for died, and the
 * track for what is left. The words beside it say the same in numbers.
 */
export function StockBar({ head, sold, died }: { head: number; sold: number; died: number }) {
  const pct = (n: number) => `${head > 0 ? (n / head) * 100 : 0}%`
  return (
    <div
      className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-sunk"
      role="img"
      aria-label={t('{sold} sold, {died} died, {left} left', { sold, died, left: head - sold - died })}
    >
      {sold ? <span className="rounded-full bg-brand" style={{ width: pct(sold) }} /> : null}
      {died ? <span className="rounded-full bg-bad" style={{ width: pct(died) }} /> : null}
    </div>
  )
}

// ------------------------------------------------------------- choices --

/** A row of choices on a sunken track: the page's own switch. */
export function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
  className = '',
}: {
  options: readonly { value: T; label: ReactNode }[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={`flex gap-1 rounded-xl bg-sunk p-1 ${className}`}>
      {options.map((o) => {
        const chosen = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={chosen}
            onClick={() => onChange(o.value)}
            className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition ${
              chosen ? 'bg-paper text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Pills grown into cards, for a choice that has a figure of its own: each card shows its
 * amount. The chosen one is filled and outlined in green; the other is only outlined, in light and dark alike.
 */
export function TabCards<T extends string>({
  options,
  value,
  onChange,
  label,
  className = '',
}: {
  options: readonly { value: T; title: string; icon: LucideIcon; tone: Tone; figure: string; caption: string }[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={`grid grid-cols-2 gap-3 ${className}`}>
      {options.map((o) => {
        const chosen = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={chosen}
            onClick={() => onChange(o.value)}
            className={`flex min-w-0 flex-col rounded-card p-4 text-left transition active:scale-[0.99] ${
              chosen ? 'bg-paper shadow-card ring-2 ring-brand' : 'ring-1 ring-line hover:bg-paper/60'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <IconBadge icon={o.icon} tone={o.tone} size="sm" />
              <span className={`min-w-0 truncate font-semibold ${chosen ? 'text-ink' : 'text-ink-soft'}`}>{o.title}</span>
            </span>
            <span className="tnum mt-3 block text-xl leading-tight font-semibold tracking-tight break-words sm:text-2xl">
              {o.figure}
            </span>
            <span className="mt-1 block text-[13px] leading-snug text-ink-soft">{o.caption}</span>
          </button>
        )
      })}
    </div>
  )
}

// --------------------------------------------------------------- lists --

/** A titled card of rows. */
export function Section({
  title,
  aside,
  children,
  className = '',
}: {
  title?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      {title || aside ? (
        <div className="mb-2 flex items-end justify-between gap-3 px-1">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {aside ? <div className="text-sm text-ink-soft">{aside}</div> : null}
        </div>
      ) : null}
      <div className="card divide-y divide-line-soft overflow-hidden">{children}</div>
    </section>
  )
}

/** One line in a Section: its picture, what it is, and its figure on the right. `below` sits under the words. */
export function Row({
  to,
  onClick,
  leading,
  title,
  sub,
  below,
  right,
  rightSub,
}: {
  to?: string
  onClick?: () => void
  leading?: ReactNode
  title: ReactNode
  sub?: ReactNode
  below?: ReactNode
  right?: ReactNode
  rightSub?: ReactNode
}) {
  const inner = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 font-medium break-words">{title}</div>
        {sub ? <div className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-soft">{sub}</div> : null}
        {below ? <div className="mt-2">{below}</div> : null}
      </div>
      {right !== undefined || rightSub ? (
        <div className="shrink-0 text-right">
          <div className="tnum font-semibold">{right}</div>
          {rightSub ? <div className="mt-0.5 text-xs text-ink-soft">{rightSub}</div> : null}
        </div>
      ) : null}
      {/* On a phone the whole row is the button; the arrow would only take room from the name. */}
      {to || onClick ? <ChevronRight className="-mr-1 hidden h-4 w-4 shrink-0 text-ink-faint sm:block" aria-hidden /> : null}
    </>
  )
  const cls = 'flex w-full items-center gap-3 px-4 py-3 text-left'
  if (to) {
    return (
      <Link to={to} className={`${cls} transition hover:bg-sunk/50 active:bg-sunk`}>
        {inner}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} transition hover:bg-sunk/50 active:bg-sunk`}>
        {inner}
      </button>
    )
  }
  return <div className={cls}>{inner}</div>
}

// -------------------------------------------------------------- sheets --

/** Sheets now open, oldest first. */
const openSheets: number[] = []
let lastSheet = 0

/** A sheet from the bottom on a phone, a dialog on a bigger screen. */
export function Modal({
  open,
  onClose,
  title,
  tall = false,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  /** Full height on a phone whatever its content, so a search box at the top stays clear of the keyboard. */
  tall?: boolean
  children: ReactNode
}) {
  // The latest onClose, without reopening the sheet's place in the stack on every render.
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const me = ++lastSheet
    openSheets.push(me)
    // Sheets open on top of sheets (a picker inside a form): Escape closes only the top one.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openSheets[openSheets.length - 1] === me) close.current()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      openSheets.splice(openSheets.indexOf(me), 1)
      if (openSheets.length === 0) document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null
  // Into <body>, not the page: a sheet opened from inside a page's form must
  // not end up as a form inside that form.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label={t('Close')} className="absolute inset-0 bg-scrim/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-paper shadow-2xl sm:max-w-lg sm:rounded-3xl ${
          tall ? 'h-[88dvh] sm:h-[min(42rem,85vh)]' : ''
        }`}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line sm:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2 sm:pt-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close')}
            className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-soft transition hover:bg-sunk hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = t('Delete'),
  busy = false,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  busy?: boolean
  error?: unknown
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-5">
        <div className="text-[15px] leading-relaxed text-ink-soft">{message}</div>
        <ErrorNote error={error} />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            {t('Cancel')}
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? t('Working…') : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * The bottom of a long form: any problem, then Cancel and Save. Pinned to
 * the bottom of a phone screen so Save is always one tap away.
 */
export function ActionBar({ error, children }: { error?: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-line-soft bg-ground/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
      {error ? <div className="mb-3">{error}</div> : null}
      <div className="flex justify-end gap-2">{children}</div>
    </div>
  )
}

// -------------------------------------------------------------- inputs --

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs leading-snug text-ink-soft">{hint}</span> : null}
    </label>
  )
}

/**
 * A rupee amount. Says it back in words inside the box ("12.5 lakh",
 * "52 hazar"), so a missing or extra zero is easy to spot.
 */
export function MoneyInput({
  value,
  onChange,
  disabled,
  autoFocus,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
  ariaLabel?: string
}) {
  const n = toNumber(value)
  const words = Number.isFinite(n) ? inWords(n) : null
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-faint">Rs</span>
      <input
        className={`field tnum pl-11 ${words ? 'pr-24' : ''}`}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      />
      {words ? (
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-medium text-brand-deep">
          {words}
        </span>
      ) : null}
    </span>
  )
}

export function CountInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
}) {
  return (
    <input
      className="field tnum"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      placeholder="0"
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
    />
  )
}

// ------------------------------------------------------------- states --

export function Empty({ title, icon, children }: { title: string; icon?: LucideIcon; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon ? <IconBadge icon={icon} size="lg" /> : null}
      <div className={`font-semibold text-ink ${icon ? 'mt-3' : ''}`}>{title}</div>
      {children ? <div className="mt-1 max-w-xs text-sm text-ink-soft">{children}</div> : null}
    </div>
  )
}

export function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-ink-soft">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden />
      {t('Loading…')}
    </div>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div role="alert" className="rounded-xl bg-bad-wash px-3.5 py-3 text-sm font-medium text-bad">
      {message}
    </div>
  )
}

/** The usual guard at the top of a page: an error, or loading, or nothing to stop for. */
export function Gate({ error, ready }: { error: unknown; ready: boolean }) {
  if (error) {
    return (
      <div className="space-y-3 py-8">
        <ErrorNote error={error} />
        <button type="button" className="btn-ghost" onClick={() => window.location.reload()}>
          {t('Try again')}
        </button>
      </div>
    )
  }
  if (!ready) return <Loading />
  return null
}
