import { QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

/**
 * Query defaults for the app: one retry, no refetch on focus, 30 s of fresh
 * data. A failed query shows a toast; mutations handle their own errors.
 */
export const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => toast.error(error.message),
    }),
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
    },
  })
