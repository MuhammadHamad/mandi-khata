import { useEffect, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, Check, CloudUpload, RefreshCw, Wifi, WifiOff, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useAuth } from '../data/auth'
import { useSync } from '../data/queries'
import type { Queued } from '../data/local'
import { ago } from '../lib/format'
import { t } from '../lib/i18n'
import { useOnline } from '../lib/pwa'
import { Modal } from './ui'

// ------------------------------------------------------------- mood --

/** The connection and the queue in one word, for the dot, the strip and the sidebar. */
type Mood = 'ok' | 'offline' | 'sending' | 'problem' | 'signed-out'

function useMood() {
  const online = useOnline()
  const sync = useSync()
  const mood: Mood = !sync
    ? online
      ? 'ok'
      : 'offline'
    : sync.signedOut
      ? 'signed-out'
      : sync.problems.length
        ? 'problem'
        : !online || !sync.online
          ? 'offline'
          : sync.waiting > 0
            ? 'sending'
            : 'ok'
  return { mood, sync }
}

const DOT: Record<Mood, string> = {
  ok: 'bg-good',
  offline: 'bg-owed',
  sending: 'bg-bank',
  problem: 'bg-bad',
  'signed-out': 'bg-bad',
}

// The one sheet with the queue, opened from the strip, the sidebar or the More page.
let sheetOpen = false
const sheetListeners = new Set<() => void>()
export function openSyncSheet(open = true) {
  sheetOpen = open
  sheetListeners.forEach((l) => l())
}
const useSheetOpen = () =>
  useSyncExternalStore(
    (l) => {
      sheetListeners.add(l)
      return () => void sheetListeners.delete(l)
    },
    () => sheetOpen,
  )

/** True only once `on` has stayed true for a while, so a quick save doesn't flash a strip. */
function useAfter(on: boolean, ms: number): boolean {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!on) {
      setLate(false)
      return
    }
    const timer = setTimeout(() => setLate(true), ms)
    return () => clearTimeout(timer)
  }, [on, ms])
  return on && late
}

// ------------------------------------------------------------- pieces --

/** A dot on the logo: green all saved, amber offline, blue sending, red when something needs the owner. */
export function OnlineDot() {
  const { mood } = useMood()
  const words = moodWords(mood, useSync())
  return (
    <span
      role="img"
      aria-label={words}
      title={words}
      className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-paper ${DOT[mood]}`}
    />
  )
}

function moodWords(mood: Mood, sync: ReturnType<typeof useSync>): string {
  switch (mood) {
    case 'ok':
      return sync ? t('Online · everything is saved') : t('Online')
    case 'offline':
      return !sync?.waiting
        ? t('Offline')
        : sync.waiting === 1
          ? t('Offline · 1 change waiting')
          : t('Offline · {n} changes waiting', { n: sync.waiting })
    case 'sending':
      return t('Sending…')
    case 'problem':
      return needYou(sync?.problems.length ?? 0)
    case 'signed-out':
      return t('Sign in again to send changes')
  }
}

/** "1 change needs you", "3 changes need you". */
export function needYou(n: number): string {
  return n === 1 ? t('1 change needs you') : t('{n} changes need you', { n })
}

/** "1 change waiting to be sent", "3 changes waiting to be sent". */
export function waitingWords(n: number): string {
  return n === 1 ? t('1 change waiting to be sent') : t('{n} changes waiting to be sent', { n })
}

const MOOD_ICON: Record<Mood, LucideIcon> = {
  ok: Wifi,
  offline: WifiOff,
  sending: RefreshCw,
  problem: AlertTriangle,
  'signed-out': AlertTriangle,
}
const MOOD_TEXT: Record<Mood, string> = {
  ok: 'text-good',
  offline: 'text-owed',
  sending: 'text-bank',
  problem: 'text-bad',
  'signed-out': 'text-bad',
}

/** The connection and the queue in words, in the sidebar where there is room. Opens the sheet when there is one. */
export function OnlineLine() {
  const { mood, sync } = useMood()
  const Icon = MOOD_ICON[mood]
  const body = (
    <>
      <Icon className={`h-4 w-4 shrink-0 ${mood === 'sending' ? 'animate-spin' : ''}`} aria-hidden />
      <span className="min-w-0 truncate">{moodWords(mood, sync)}</span>
    </>
  )
  const cls = `flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] font-medium ${MOOD_TEXT[mood]}`
  return sync ? (
    <button type="button" onClick={() => openSyncSheet()} className={`${cls} transition hover:bg-sunk`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/**
 * Said plainly under the header whenever there is something to know: no internet (the
 * app goes on working and nothing is lost), changes the server refused, or a sign-in to
 * renew. A tap opens the list of what is waiting.
 */
export function OfflineStrip({ className = '' }: { className?: string }) {
  const { mood, sync } = useMood()
  const { signOut } = useAuth()
  const slowSend = useAfter(mood === 'sending' && Boolean(sync?.syncing), 2500)
  if (mood === 'ok' || (mood === 'sending' && !slowSend)) return null

  const tone =
    mood === 'problem' || mood === 'signed-out' ? 'bg-bad-wash text-bad' : mood === 'sending' ? 'bg-bank-wash text-bank' : 'bg-owed-wash text-owed'
  const Icon = MOOD_ICON[mood]
  const text =
    mood === 'offline' ? (
      <>
        <span className="font-semibold">{t('No internet.')}</span> {t('Keep working: everything is saved on this phone.')}
        {sync?.waiting ? (
          <>
            {' '}
            {sync.waiting === 1
              ? t('1 change will be sent when it is back.')
              : t('{n} changes will be sent when it is back.', { n: sync.waiting })}
          </>
        ) : null}
      </>
    ) : mood === 'sending' ? (
      sync?.waiting === 1 ? (
        t('Sending 1 change to the server…')
      ) : (
        t('Sending {n} changes to the server…', { n: sync?.waiting ?? 0 })
      )
    ) : mood === 'problem' ? (
      <>
        <span className="font-semibold">
          {sync?.problems.length === 1
            ? t('1 change could not be saved on the server.')
            : t('{n} changes could not be saved on the server.', { n: sync?.problems.length ?? 0 })}
        </span>{' '}
        {t('Tap to see them.')}
      </>
    ) : (
      t('Changes are waiting: sign in again to send them.')
    )

  const body = (
    <>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${mood === 'sending' ? 'animate-spin' : ''}`} aria-hidden />
      <span className="min-w-0 flex-1">{text}</span>
    </>
  )
  const cls = `flex w-full items-start gap-2.5 px-4 py-2.5 text-left text-[13px] leading-snug ${tone} ${className}`
  if (mood === 'signed-out') {
    return (
      <div role="status" className={cls}>
        {body}
        <button type="button" onClick={() => void signOut()} className="shrink-0 font-semibold underline">
          {t('Sign in')}
        </button>
      </div>
    )
  }
  return sync ? (
    <button type="button" role="status" onClick={() => openSyncSheet()} className={cls}>
      {body}
    </button>
  ) : (
    <div role="status" className={cls}>
      {body}
    </div>
  )
}

// ------------------------------------------------------------- the sheet --

/**
 * Every change made on this phone that the server hasn't confirmed: the ones it refused or
 * that clash with another phone first, each with what can be done about it, then the ones
 * simply waiting for a connection.
 */
export function SyncSheet() {
  const open = useSheetOpen()
  const sync = useSync()
  const online = useOnline()
  if (!sync) return null
  const { control, problems } = sync
  const waiting = sync.queue.filter((q) => q.state === 'waiting')
  const live = online && sync.online

  return (
    <Modal open={open} onClose={() => openSyncSheet(false)} title={t('Sync with the server')}>
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-2xl bg-sunk/70 p-3.5">
          {live ? <Wifi className="h-5 w-5 shrink-0 text-good" aria-hidden /> : <WifiOff className="h-5 w-5 shrink-0 text-owed" aria-hidden />}
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold">{live ? t('Online') : t('Offline')}</div>
            <div className="text-ink-soft">
              {sync.lastSync ? t('Last brought up to date {when}', { when: ago(sync.lastSync) }) : t('Not brought up to date yet')}
            </div>
          </div>
          <button
            type="button"
            className="btn-soft shrink-0"
            disabled={!online || sync.syncing}
            onClick={() => void control.syncNow()}
          >
            <RefreshCw className={`h-4 w-4 ${sync.syncing ? 'animate-spin' : ''}`} aria-hidden />
            {t('Sync now')}
          </button>
        </div>

        {problems.length ? (
          <section className="space-y-2">
            <h3 className="px-1 text-[15px] font-semibold text-bad">{t('Need you ({n})', { n: problems.length })}</h3>
            {problems.map((q) => (
              <Problem key={q.op} q={q} />
            ))}
          </section>
        ) : null}

        {waiting.length ? (
          <section>
            <h3 className="mb-2 px-1 text-[15px] font-semibold">{t('Waiting to be sent ({n})', { n: waiting.length })}</h3>
            <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line-soft">
              {waiting.map((q) => (
                <li key={q.op} className="flex items-center gap-3 px-3.5 py-2.5">
                  <CloudUpload className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{q.label}</span>
                  <span className="shrink-0 text-xs text-ink-soft">{ago(q.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!problems.length && !waiting.length ? (
          <p className="flex items-center justify-center gap-2 py-4 text-sm font-medium text-good">
            <Check className="h-4 w-4" aria-hidden />
            {t('Everything on this phone is on the server too.')}
          </p>
        ) : null}

        <p className="px-1 text-xs leading-relaxed text-ink-soft">
          {t('Every change is saved on this phone first, then sent to the server by itself whenever there is internet. Nothing is lost if the connection drops.')}
        </p>
      </div>
    </Modal>
  )
}

function Problem({ q }: { q: Queued }) {
  const sync = useSync()
  const [busy, setBusy] = useState(false)
  if (!sync) return null
  const run = (work: () => Promise<void>) => async () => {
    setBusy(true)
    try {
      await work()
    } finally {
      setBusy(false)
    }
  }
  const conflict = q.state === 'conflict'
  return (
    <div className="rounded-xl border border-bad/30 bg-bad-wash/40 p-3.5">
      <div className="text-sm font-semibold">{q.label}</div>
      <p className="mt-1 text-[13px] leading-snug text-ink-soft">
        {conflict ? t('This was changed on another phone too. Which copy should stay?') : q.problem}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {conflict ? (
          <>
            <button type="button" className="btn-primary" disabled={busy} onClick={run(() => sync.control.keepMine(q.op))}>
              {t('Keep mine')}
            </button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={run(() => sync.control.drop(q.op))}>
              {t('Keep the other phone’s')}
            </button>
          </>
        ) : (
          <>
            {q.local ? null : (
              <button type="button" className="btn-soft" disabled={busy} onClick={run(() => sync.control.retry(q.op))}>
                {t('Try again')}
              </button>
            )}
            <button type="button" className="btn-ghost text-bad" disabled={busy} onClick={run(() => sync.control.drop(q.op))}>
              <X className="h-4 w-4" aria-hidden />
              {t('Drop this change')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------- updates --

/**
 * A new version of the app, ready: it waits for a tap, so nothing is reloaded under a
 * half-filled form. Long-open apps look for one every hour, and the first time the app is
 * ready to open offline it says so.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000)
    },
  })
  useEffect(() => {
    if (!offlineReady) return
    const timer = setTimeout(() => setOfflineReady(false), 6000)
    return () => clearTimeout(timer)
  }, [offlineReady, setOfflineReady])
  const [updating, setUpdating] = useState(false)

  if (!needRefresh && !offlineReady) return null
  return (
    <div className="fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-6">
      <div role="status" className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-paper shadow-2xl">
        {needRefresh ? (
          <>
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{t('A new version of the app is ready.')}</span>
            <button
              type="button"
              disabled={updating}
              onClick={() => {
                setUpdating(true)
                void updateServiceWorker(true)
              }}
              className="shrink-0 rounded-lg bg-paper px-3 py-1.5 font-semibold text-ink"
            >
              {t('Update')}
            </button>
            <button
              type="button"
              aria-label={t('Later')}
              onClick={() => setNeedRefresh(false)}
              className="-mr-1 shrink-0 rounded-lg p-1 text-paper/70 hover:text-paper"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </>
        ) : (
          <>
            <Wifi className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{t('The app now opens without internet too.')}</span>
          </>
        )}
      </div>
    </div>
  )
}
