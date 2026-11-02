import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

import { api } from '@/server/api'
import { port, webDir } from '@/server/config/env'

/**
 * The HTTP server: the API under /api and, in the image, the built screen
 * everywhere else. A path the screen has no file for answers its index.html,
 * so the screen's own routes work when the page reloads.
 */
const app = new Hono().route('/', api)
if (webDir) {
  app.use('*', serveStatic({ root: webDir }))
  app.get('*', serveStatic({ root: webDir, path: 'index.html' }))
}

/** Listens until Ctrl+C or a container stop, then lets open requests finish */
const server = serve({ fetch: app.fetch, port }, ({ port }) =>
  console.info(`✓ Listening on http://localhost:${port}`)
)
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
