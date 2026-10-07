/**
 * The app as an installed app: whether the phone is online, whether it can be
 * installed (and installing it), and asking the browser to keep its storage.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'

// ------------------------------------------------------------- online --

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

/** Whether the phone has a connection, as the browser sees it. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}

// ------------------------------------------------------------ install --

/** Chrome and Edge's install prompt, which the page keeps until the owner asks for it. */
type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallPromptEvent | null = null
let installedNow = false
const installListeners = new Set<() => void>()
const tell = () => installListeners.forEach((l) => l())

// Listened for as soon as this file loads: the browser offers the prompt once, early.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    tell()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installedNow = true
    tell()
  })
}

/** Opened as an installed app rather than in a browser tab. */
export function runningInstalled(): boolean {
  if (typeof window === 'undefined') return false
  return (
    installedNow ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iPhone and iPad Safari: no install prompt, only Share → Add to Home Screen. */
export function isAppleMobile(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

export type InstallState = 'installed' | 'ready' | 'apple' | 'browser-menu'

export function useInstall(): { state: InstallState; install: () => Promise<void> } {
  const [, redraw] = useState(0)
  useEffect(() => {
    const listener = () => redraw((n) => n + 1)
    installListeners.add(listener)
    return () => void installListeners.delete(listener)
  }, [])
  const state: InstallState = runningInstalled()
    ? 'installed'
    : deferred
      ? 'ready'
      : isAppleMobile()
        ? 'apple'
        : 'browser-menu'
  const install = async () => {
    if (!deferred) return
    const prompt = deferred
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') {
      deferred = null
      installedNow = true
    }
    tell()
  }
  return { state, install }
}

// ------------------------------------------------------------ storage --

/**
 * Asks the browser not to clear this app's records when the phone runs low on space.
 * Browsers decide for themselves: an installed app is usually granted it.
 */
export async function keepStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Whether the browser has agreed to keep the records; null when it can't say. */
export function useStorageKept(): boolean | null {
  const [kept, setKept] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null
        if (live) setKept(persisted)
      } catch {
        if (live) setKept(null)
      }
    })()
    return () => {
      live = false
    }
  }, [])
  return kept
}
