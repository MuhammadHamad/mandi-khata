import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { User } from './api'
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
    return () => {
      alive = false
      stop()
    }
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      signIn: async (email, password) => setUser(await backend.signIn(email, password)),
      signOut: async () => {
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
