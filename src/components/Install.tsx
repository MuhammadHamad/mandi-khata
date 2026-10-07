import { CheckCircle2, Download, ShieldCheck, TriangleAlert } from 'lucide-react'
import { t } from '../lib/i18n'
import { useInstall, useStorageKept } from '../lib/pwa'

/**
 * Putting the app on the home screen. Chrome and Edge offer a one-tap install; on an
 * iPhone it is Safari's Share button. `compact` (on the More page) shows only when it can
 * actually be done from here.
 */
export function InstallCard({ compact = false }: { compact?: boolean }) {
  const { state, install } = useInstall()
  if (compact && state !== 'ready' && state !== 'apple') return null
  const installed = state === 'installed'
  return (
    <div className="card flex items-start gap-3.5 p-4">
      <img src="/icons/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-semibold">
          {installed ? <CheckCircle2 className="h-4 w-4 text-good" aria-hidden /> : null}
          {installed ? t('The app is installed') : t('Install the app')}
        </div>
        <p className="mt-0.5 text-sm leading-snug text-ink-soft">
          {installed
            ? t('It opens from its own icon, even without internet.')
            : state === 'apple'
              ? t('In Safari, tap the Share button, then “Add to Home Screen”.')
              : state === 'browser-menu'
                ? t('Open the browser menu and choose “Install app” or “Add to Home screen”.')
                : t('It opens from its own icon like any app, and works without internet.')}
        </p>
        {state === 'ready' ? (
          <button type="button" className="btn-primary mt-3" onClick={() => void install()}>
            <Download className="h-4 w-4" aria-hidden />
            {t('Install')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Whether the browser has promised to keep the records on this phone. */
export function StorageNote() {
  const kept = useStorageKept()
  if (kept === null) return null
  const Icon = kept ? ShieldCheck : TriangleAlert
  return (
    <p className={`flex items-start gap-2 text-sm leading-snug ${kept ? 'text-good' : 'text-owed'}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {kept
        ? t('The records on this phone are kept safe: the browser will not clear them.')
        : t('The browser may clear records on this phone when it runs low on space. Installing the app helps keep them.')}
    </p>
  )
}
