import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { describeError, toApiFailure } from './api'

/**
 * How often a screen asks again while work it started is pending: every 2 s
 * in the first minute, every 5 s up to 5 minutes, then every 30 s, so it feels
 * live right after an action and stays quiet on a long wait.
 */
export const pollInterval = (startedAt: string): number => {
  const age = Date.now() - Date.parse(startedAt)
  if (age < 60_000) return 2_000
  if (age < 5 * 60_000) return 5_000
  return 30_000
}

/**
 * A session that ended while the screen was open (expired, or signed out in
 * another tab) sends the person to the login, back to this page afterwards.
 * On the login page itself a 401 is a wrong password, which the form shows.
 */
export const signInAgain = () => {
  if (location.pathname === '/login') return
  const here = `${location.pathname}${location.search}`
  location.assign(`/login?expired=1&redirect=${encodeURIComponent(here)}`)
}

/**
 * The one query client of the tab. A failed read shows a toast, except a 401,
 * which signs in again; the guard's own `me` read handles its 401 itself.
 * Mutations show their own errors. Only server errors are retried, once.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (toApiFailure(error).status === 401) {
        if (query.queryKey[0] !== 'me') signInAgain()
        return
      }
      toast.error(describeError(error))
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (toApiFailure(error).status === 401) signInAgain()
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        failureCount < 1 && toApiFailure(error).status >= 500,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})
