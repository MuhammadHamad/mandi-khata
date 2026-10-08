import { useState } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, ChevronRight, CloudUpload, Languages, LogOut, RotateCcw, Store } from 'lucide-react'
import { InstallCard, StorageNote } from '../components/Install'
import { LangSwitch } from '../components/Lang'
import { needYou, openSyncSheet, waitingWords } from '../components/Status'
import { Card, ConfirmDialog, ErrorNote, Field, Gate, IconBadge, MoneyInput, PageHeader } from '../components/ui'
import { useAuth } from '../data/auth'
import { IS_DEMO, backend } from '../data/backend'
import { useAction, useBooks, useSync } from '../data/queries'
import type { Derived } from '../lib/books'
import { plain, toNumber } from '../lib/format'
import { t } from '../lib/i18n'

export default function Settings() {
  const { view, error } = useBooks()
  if (!view) return <Gate error={error} ready={false} />
  return <SettingsForm key={JSON.stringify(view.book.settings)} view={view} />
}

function SettingsForm({ view }: { view: Derived }) {
  const { user, signOut } = useAuth()
  const s = view.book.settings
  const [name, setName] = useState(s.business_name)
  const [cash, setCash] = useState(s.opening_cash ? plain(s.opening_cash) : '')
  const [bank, setBank] = useState(s.opening_bank ? plain(s.opening_bank) : '')
  const [saved, setSaved] = useState(false)
  const [resetting, setResetting] = useState<'empty' | 'sample' | null>(null)
  const save = useAction(backend.saveSettings)
  const reset = useAction((withSample: boolean) => backend.resetDemo!(withSample))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaved(false)
    try {
      await save.mutateAsync({
        business_name: name,
        opening_cash: cash.trim() === '' ? 0 : toNumber(cash),
        opening_bank: bank.trim() === '' ? 0 : toNumber(bank),
      })
      setSaved(true)
    } catch {
      // Shown below the form.
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('Settings')} />

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <IconBadge icon={Languages} tone="bank" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t('Language')}</h2>
          <p className="text-sm text-ink-soft">{t('Words on the screen. Each phone remembers its own choice.')}</p>
        </div>
        <LangSwitch />
      </Card>

      <div className="space-y-2">
        <InstallCard />
        <div className="px-1">
          <StorageNote />
        </div>
      </div>

      <SyncCard />

      <form onSubmit={submit}>
        <Card className="space-y-5 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <IconBadge icon={Store} tone="brand" />
            <h2 className="font-semibold">{t('Business name')}</h2>
          </div>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} aria-label={t('Business name')} />
          <div className="border-t border-line-soft pt-5">
            <h2 className="font-semibold">{t('Money when you started')}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {t(
                'What was in the cash box and the bank on the day you began using the app. Every sale, payment and expense since is added to these.',
              )}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Cash in hand')}>
              <MoneyInput value={cash} onChange={setCash} />
            </Field>
            <Field label={t('In the bank')}>
              <MoneyInput value={bank} onChange={setBank} />
            </Field>
          </div>
          <ErrorNote error={save.error} />
          <div className="flex items-center justify-end gap-3">
            {saved ? <span className="text-sm font-medium text-good">{t('Saved')}</span> : null}
            <button type="submit" className="btn-primary min-w-32" disabled={save.isPending}>
              {save.isPending ? t('Saving…') : t('Save')}
            </button>
          </div>
        </Card>
      </form>

      {IS_DEMO ? (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <IconBadge icon={RotateCcw} tone="owed" />
            <h2 className="font-semibold">{t('Demo records')}</h2>
          </div>
          <p className="text-sm text-ink-soft">
            {t(
              'The demo keeps its records in this browser only. Start again with the sample books, or with empty ones to try entering your own.',
            )}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn-soft" onClick={() => setResetting('sample')}>
              {t('Load the sample again')}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setResetting('empty')}>
              {t('Start empty')}
            </button>
          </div>
          <ConfirmDialog
            open={resetting !== null}
            title={resetting === 'empty' ? t('Start with empty books?') : t('Load the sample again?')}
            message={t('Everything entered in this demo is cleared.')}
            confirmLabel={resetting === 'empty' ? t('Start empty') : t('Load sample')}
            busy={reset.isPending}
            error={reset.error}
            onClose={() => setResetting(null)}
            onConfirm={async () => {
              try {
                await reset.mutateAsync(resetting === 'sample')
                setResetting(null)
              } catch {
                // Shown in the dialog.
              }
            }}
          />
        </Card>
      ) : user ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div className="min-w-0">
            <div className="text-sm text-ink-soft">{t('Signed in as')}</div>
            <div className="truncate font-medium">{user.email}</div>
          </div>
          <button type="button" className="btn-ghost" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" aria-hidden />
            {t('Sign out')}
          </button>
        </Card>
      ) : null}
    </div>
  )
}

/** Where the changes made on this phone stand, and the list to sort out any trouble. Not in the demo. */
function SyncCard() {
  const sync = useSync()
  if (!sync) return null
  const trouble = sync.problems.length > 0
  return (
    <button
      type="button"
      onClick={() => openSyncSheet()}
      className="card flex w-full items-center gap-3 p-4 text-left transition hover:bg-sunk/50 active:bg-sunk"
    >
      <IconBadge icon={trouble ? AlertTriangle : CloudUpload} tone={trouble ? 'bad' : 'bank'} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{t('Sync with the server')}</span>
        <span className="block text-sm text-ink-soft">
          {trouble
            ? needYou(sync.problems.length)
            : sync.waiting
              ? waitingWords(sync.waiting)
              : t('Everything is saved on the server')}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
    </button>
  )
}
