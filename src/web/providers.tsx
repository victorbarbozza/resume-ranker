import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Toaster } from 'sonner'

import { queryClient } from '@/web/lib/query-client'
import { PHONE_QUERY, useMediaQuery } from '@/web/lib/use-media-query'

/** Props of the app providers */
interface ProvidersProps {
  children: ReactNode
}

/** React Query and toasts for the whole app; on a phone toasts drop from the top, clear of the tab bar */
export function Providers({ children }: ProvidersProps) {
  const phone = useMediaQuery(PHONE_QUERY)
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position={phone ? 'top-center' : 'bottom-right'} />
    </QueryClientProvider>
  )
}
