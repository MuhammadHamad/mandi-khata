import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, TrendingDown, TrendingUp, TriangleAlert, X } from 'lucide-react'
import { lakh, rs, toNumber } from '../lib/format'
import { t } from '../lib/i18n'

/** "Profit", "Loss so far": the word that goes with a result, in the chosen language. */
function gainWord(loss: boolean, soFar: boolean): string {
  if (soFar) return loss ? t('Loss so far') : t('Profit so far')
  return loss ? t('Loss') : t('Profit')
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>
}

/** A page's title, a quiet line under it, a way back, and its main actions. */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: { to: string; label: string }
  actions?: ReactNode
}) {
  return (
    <header className="mb-5">
      {back ? (
        <Link
          to={back.to}
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-ink-soft transition hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle ? <div className="mt-1 text-sm text-ink-soft">{subtitle}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

/**
 * One figure at a glance. The value keeps the page's own sans face and ink;
 * any judgement on it (profit or loss) sits beside it as `status`.
 */
export function Tile({
  label,
  value,
  status,
  detail,
  to,
}: {
  label: string
  value: string
  status?: ReactNode
  detail?: ReactNode
  to?: string
}) {
  const body = (
    <>
      <div className="text-sm font-medium text-ink-soft">{label}</div>
      <div className="mt-1 text-[1.4rem] leading-tight font-semibold tracking-tight text-ink sm:text-2xl">{value}</div>
      {status ? <div className="mt-1 text-sm">{status}</div> : null}
      {detail ? <div className="mt-1 text-xs text-ink-soft">{detail}</div> : null}
    </>
  )
  return to ? (
    <Link to={to} className="card block px-4 py-3.5 transition hover:border-ink-faint">
      {body}
    </Link>
  ) : (
    <div className="card px-4 py-3.5">{body}</div>
  )
}

/**
 * Profit or loss, with an arrow and the word as well as the colour.
 * `soFar` for a challan that is still selling.
 */
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

/**
 * Profit or loss for the right-hand side of a Row: the arrow and amount on
 * top, the word underneath. Spread it into the Row: `{...gainParts(x)}`.
 */
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
    rightSub: (
      <span className={`font-medium ${loss ? 'text-bad' : 'text-good'}`}>{gainWord(loss, soFar)}</span>
    ),
  }
}

const BADGE = {
  neutral: 'bg-sunk text-ink-soft',
  brand: 'bg-brand-wash text-brand-deep',
  good: 'bg-good-wash text-good',
  bad: 'bg-bad-wash text-bad',
  owed: 'bg-owed-wash text-owed',
  bank: 'bg-bank-wash text-bank',
} as const

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof BADGE; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${BADGE[tone]}`}>
      {children}
    </span>
  )
}

/** A row of rounded choices on a sunken track. */
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
    <div role="group" aria-label={label} className={`flex gap-1 rounded-full bg-sunk p-1 ${className}`}>
      {options.map((o) => {
        const chosen = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={chosen}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ${
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

/** A captioned card holding rows. */
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
          <h2 className="font-sans text-sm font-semibold text-ink-soft">{title}</h2>
          {aside ? <div className="text-sm text-ink-soft">{aside}</div> : null}
        </div>
      ) : null}
      <div className="card divide-y divide-line-soft overflow-hidden">{children}</div>
    </section>
  )
}

/** One tappable line in a Section: what it is on the left, its figure on the right. */
export function Row({
  to,
  onClick,
  title,
  sub,
  right,
  rightSub,
}: {
  to?: string
  onClick?: () => void
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
  rightSub?: ReactNode
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        {sub ? <div className="mt-0.5 truncate text-sm text-ink-soft">{sub}</div> : null}
      </div>
      {right !== undefined || rightSub ? (
        <div className="shrink-0 text-right">
          <div className="tnum font-semibold">{right}</div>
          {rightSub ? <div className="mt-0.5 text-xs text-ink-soft">{rightSub}</div> : null}
        </div>
      ) : null}
      {to || onClick ? <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden /> : null}
    </>
  )
  const cls = 'flex w-full items-center gap-3 px-4 py-3 text-left'
  if (to) {
    return (
      <Link to={to} className={`${cls} transition hover:bg-sunk/60`}>
        {inner}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} transition hover:bg-sunk/60`}>
        {inner}
      </button>
    )
  }
  return <div className={cls}>{inner}</div>
}

export function Banner({ tone = 'warn', title, children }: { tone?: 'warn' | 'info'; title?: string; children: ReactNode }) {
  const styles = tone === 'warn' ? 'border-bad/25 bg-bad-wash text-bad' : 'border-line bg-brand-wash text-brand-deep'
  return (
    <div className={`flex gap-3 rounded-xl border px-3.5 py-3 text-sm ${styles}`}>
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <div className="font-semibold">{title}</div> : null}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
    </div>
  )
}

/** A sheet from the bottom on a phone, a dialog on a bigger screen. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

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
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-xl sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close')}
            className="-mr-2 rounded-lg p-2 text-ink-soft transition hover:bg-sunk hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
      <div className="space-y-4">
        <div className="text-sm text-ink-soft">{message}</div>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
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

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-soft">{hint}</span> : null}
    </label>
  )
}

/** A rupee amount. Shows it grouped, and in lakh once it is big, so a missing zero is easy to spot. */
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
  const words = Number.isFinite(n) && Math.abs(n) >= 1000 ? [rs(n), lakh(n)].filter(Boolean).join(' · ') : null
  return (
    <span className="block">
      <span className="relative block">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-faint">Rs</span>
        <input
          className="field tnum pl-10"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
      <span className="mt-1 block min-h-4 text-xs text-ink-soft">{words}</span>
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

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-12 text-center">
      <div className="font-display text-base font-semibold text-ink-soft">{title}</div>
      {children ? <div className="mt-1 text-sm text-ink-soft">{children}</div> : null}
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
    <div role="alert" className="rounded-xl border border-bad/25 bg-bad-wash px-3.5 py-2.5 text-sm text-bad">
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
