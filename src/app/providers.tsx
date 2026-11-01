'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { Toaster } from 'sonner'

import { createQueryClient } from '@/lib/query-client'

/** Props of the app providers */
interface ProvidersProps {
  children: ReactNode
}

/** React Query and toasts for the whole app, with one query client per browser tab */
export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  )
}
