import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app'
import { Providers } from './providers'
import './styles.css'

/** The element of index.html the screen renders into */
const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root element')

createRoot(root).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>
)
