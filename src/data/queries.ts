import { useMemo, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { derive } from '../lib/books'
import { useAuth } from './auth'
import { backend } from './backend'

/**
 * The whole book, loaded once and shared by every page, with the figures
 * most pages need already worked out. Keyed by login so two accounts on one
 * phone never share a cache.
 */
export function useBooks() {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['book', user?.email ?? ''],
    queryFn: () => backend.load(),
    enabled: user !== null,
  })
  const view = useMemo(() => (query.data ? derive(query.data) : null), [query.data])
  return { view, error: query.error, refetch: query.refetch }
}

/**
 * A save or delete. The book is reloaded before the call returns, so a page
 * opened straight after a save already shows it.
 */
export function useAction<A, R>(run: (args: A) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['book'] }),
  })
}

const noSync = () => () => {}
const nothing = () => null

/** The queue of changes waiting for the server, and its troubles; null in the demo, which has no server. */
export function useSync() {
  const sync = backend.sync
  const state = useSyncExternalStore(sync ? sync.subscribe : noSync, sync ? sync.state : nothing, nothing)
  return sync && state ? { ...state, control: sync } : null
}
