import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { LangSwitch } from '../components/Lang'
import { ErrorNote, Field } from '../components/ui'
import { useAuth } from '../data/auth'
import { t } from '../lib/i18n'

export default function Login() {
  const { user, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (user) return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col px-4 pt-4 pb-8">
      <div className="flex justify-end">
        <LangSwitch />
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <img src="/favicon.svg" alt="" className="h-14 w-14" />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">Mandi App</h1>
        <p className="mt-1.5 text-ink-soft">{t('Challans, sales, ledgers and cash, in one place.')}</p>
        <form onSubmit={submit} className="card mt-8 space-y-4 p-5">
          <Field label={t('Email')}>
            <input
              className="field"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label={t('Password')}>
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <ErrorNote error={error} />
          <button type="submit" className="btn-primary min-h-12 w-full text-base" disabled={busy}>
            {busy ? t('Signing in…') : t('Sign in')}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-ink-soft">{t("Ask the owner for the business's login.")}</p>
      </div>
    </div>
  )
}
