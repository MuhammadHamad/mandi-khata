import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { User } from './api'
import { t } from '../lib/i18n'
import { backend } from './backend'

type AuthValue = {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    let alive = true
    backend
      .session()
      .then((u) => alive && setUser(u))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setLoading(false))
    const stop = backend.onAuthChange((u) => alive && setUser(u))
    // Books changed by syncing (other phones' changes, numbers given by the server) show at once.
    const stopSync = backend.sync?.subscribe((booksChanged) => {
      if (booksChanged) void queryClient.invalidateQueries({ queryKey: ['book'] })
    })
    return () => {
      alive = false
      stop()
      stopSync?.()
    }
  }, [queryClient])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      signIn: async (email, password) => setUser(await backend.signIn(email, password)),
      signOut: async () => {
        const unsent = backend.sync?.state().queue.length ?? 0
        const warning =
          unsent === 1
            ? t('1 change has not reached the server yet. It stays on this phone and goes when you sign in again. Sign out?')
            : t('{n} changes have not reached the server yet. They stay on this phone and go when you sign in again. Sign out?', { n: unsent })
        if (unsent && !window.confirm(warning)) {
          return
        }
        await backend.signOut()
        // The next login must not see this one's books, even for a moment.
        queryClient.clear()
        setUser(null)
      },
    }),
    [user, loading, queryClient],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
