import { useEffect, useState } from 'react'
import { RefreshCw, Wifi, WifiOff, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { t } from '../lib/i18n'
import { useOnline } from '../lib/pwa'

/** A dot on the logo: green online, amber offline. The words are in its label and in the strip below. */
export function OnlineDot() {
  const online = useOnline()
  return (
    <span
      role="img"
      aria-label={online ? t('Online') : t('Offline')}
      title={online ? t('Online') : t('Offline')}
      className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-paper ${online ? 'bg-good' : 'bg-owed'}`}
    />
  )
}

/** The connection in words, for the sidebar where there is room. */
export function OnlineLine() {
  const online = useOnline()
  const Icon = online ? Wifi : WifiOff
  return (
    <div className={`flex items-center gap-2 px-3 text-[13px] font-medium ${online ? 'text-good' : 'text-owed'}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {online ? t('Online') : t('Offline')}
    </div>
  )
}

/** Said plainly while there is no internet: the app goes on working and nothing is lost. */
export function OfflineStrip({ className = '' }: { className?: string }) {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" className={`flex items-start gap-2.5 bg-owed-wash px-4 py-2.5 text-[13px] leading-snug text-owed ${className}`}>
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        <span className="font-semibold">{t('No internet.')}</span> {t('Keep working: everything is saved on this phone.')}
      </span>
    </div>
  )
}

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
    <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-6">
      <div
        role="status"
        className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-paper shadow-2xl"
      >
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
