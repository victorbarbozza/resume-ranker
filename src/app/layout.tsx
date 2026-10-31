import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Resume Ranker',
  description: 'Rank candidates for a job opening.',
}

interface RootLayoutProps {
  children: ReactNode
}

export default function RootLayout({ children }: Readonly<RootLayoutProps>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
