import { useState } from 'react'
import type { FormEvent } from 'react'
import { LangSwitch } from '../components/Lang'
import { Card, ConfirmDialog, ErrorNote, Field, Gate, MoneyInput, PageHeader } from '../components/ui'
import { useAuth } from '../data/auth'
import { IS_DEMO, backend } from '../data/backend'
import { useAction, useBooks } from '../data/queries'
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
    <div className="space-y-6">
      <PageHeader title={t('Settings')} />

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="font-sans font-semibold">{t('Language')}</h2>
          <p className="mt-0.5 text-sm text-ink-soft">{t('Words on the screen. Each phone remembers its own choice.')}</p>
        </div>
        <LangSwitch />
      </Card>

      <form onSubmit={submit}>
        <Card className="space-y-4 p-4 sm:p-5">
          <Field label={t('Business name')}>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div>
            <h2 className="font-sans font-semibold">{t('Money when you started')}</h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              {t(
                'What was in the cash box and the bank on the day you began using the app. Every sale, payment and expense since is added to these.',
              )}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Cash in hand')}>
              <MoneyInput value={cash} onChange={setCash} />
            </Field>
            <Field label={t('In the bank')}>
              <MoneyInput value={bank} onChange={setBank} />
            </Field>
          </div>
          <ErrorNote error={save.error} />
          <div className="flex items-center justify-end gap-3">
            {saved ? <span className="text-sm text-good">{t('Saved')}</span> : null}
            <button type="submit" className="btn-primary min-w-28" disabled={save.isPending}>
              {save.isPending ? t('Saving…') : t('Save')}
            </button>
          </div>
        </Card>
      </form>

      {IS_DEMO ? (
        <Card className="space-y-3 p-4 sm:p-5">
          <h2 className="font-sans font-semibold">{t('Demo records')}</h2>
          <p className="text-sm text-ink-soft">
            {t(
              'The demo keeps its records in this browser only. Start again with the sample books, or with empty ones to try entering your own.',
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => setResetting('sample')}>
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
            {t('Sign out')}
          </button>
        </Card>
      ) : null}
    </div>
  )
}
