import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Providers } from './providers'
import './globals.css'

/** Title and description of every page */
export const metadata: Metadata = {
  title: 'Resume Ranker',
  description: 'Rank candidates for a job opening.',
}

/** Props of the root layout */
interface RootLayoutProps {
  children: ReactNode
}

/** Root layout: global styles and providers around every page */
export default function RootLayout({ children }: Readonly<RootLayoutProps>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
