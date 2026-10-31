import { QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export const createQueryClient = () =>
  new QueryClient({
    // a failed query shows a toast; mutations handle their own errors
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
