import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { api } from '@/server/api'
import { port, storageDir, storageDriver, webDir } from '@/server/config/env'
import { llmSettings } from '@/server/shared/connectors/llm'
import { fileStorage } from '@/server/shared/connectors/storage'
import { POLL_INTERVAL_MS } from '@/server/shared/queue/config'
import { runWorker } from '@/server/shared/queue/worker'
import { handlers } from '@/server/tasks/handlers'

try {
  const llm = llmSettings()
  if (llm.provider === 'fake') {
    console.warn(
      '! LLM is fake: every answer is a placeholder. Set LLM_MODEL, such as azure:<deployment>, to rank for real'
    )
  } else {
    console.info(`✓ LLM: ${llm.provider} ${llm.modelId}`)
  }
  await fileStorage()
  console.info(
    `✓ Storage: ${storageDriver === 'fs' ? `fs at ${storageDir}` : storageDriver}`
  )
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  console.error(`✗ Settings: ${reason}`)
  process.exit(1)
}

/**
 * The HTTP server: the API under /api and, in the image, the built screen
 * everywhere else. A path the screen has no file for answers its index.html,
 * so the screen's own routes work when the page reloads.
 *
 * Every answer carries the security headers: a CSP that loads scripts only
 * from the app itself and lets no page frame it, nosniff, no referrer and
 * HSTS. Inline styles stay allowed, because the toasts inject a style tag.
 */
const app = new Hono()
  .use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      xFrameOptions: 'DENY',
    })
  )
  .route('/', api)
if (webDir) {
  app.use('*', serveStatic({ root: webDir }))
  app.get('*', serveStatic({ root: webDir, path: 'index.html' }))
}

/** Listens until the process stops */
const server = serve({ fetch: app.fetch, port }, ({ port }) =>
  console.info(`✓ Listening on http://localhost:${port}`)
)

/**
 * Stops the queue worker, which runs in this same process: one container
 * serves the API and works the tasks, so a single always-on replica is the
 * whole app, and the LLM pace held in memory stays right. On Ctrl+C or a
 * container stop, open requests and the task in progress finish, then the
 * process exits.
 */
const stop = new AbortController()
console.info(`✓ Worker polling every ${POLL_INTERVAL_MS / 1000} s`)

/** The worker loop; settles once the task in progress has finished after a stop */
const worker = runWorker(handlers, stop.signal)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stop.abort()
    const closed = new Promise((resolve) => server.close(resolve))
    void Promise.all([closed, worker]).then(() => {
      console.info('✓ Stopped')
      process.exit(0)
    })
  })
}
