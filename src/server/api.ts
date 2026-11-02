import { Hono } from 'hono'

import { requireSession } from '@/server/domains/auth/middleware'
import { authRoutes } from '@/server/domains/auth/routes'
import { candidatesRoutes } from '@/server/domains/candidates/routes'
import { evaluationsRoutes } from '@/server/domains/evaluations/routes'
import { healthRoutes } from '@/server/domains/health/routes'
import { jobsRoutes } from '@/server/domains/jobs/routes'
import { errorResponse } from '@/server/shared/http/error-response'

/**
 * The API: every route under /api, and any error, an unknown route included,
 * answered as `{ error, message }`. Chained in one expression, so `Api` describes every
 * route for the typed client of the screen.
 *
 * `requireSession` runs before every route and answers 401 without a live
 * session, except for health and login.
 */
export const api = new Hono()
  .basePath('/api')
  .use(requireSession)
  .route('/health', healthRoutes)
  .route('/auth', authRoutes)
  .route('/jobs', jobsRoutes)
  .route('/jobs', evaluationsRoutes)
  .route('/candidates', candidatesRoutes)
  .all('*', (c) =>
    c.json({ error: 'ERR_NOT_FOUND', message: 'route not found' }, 404)
  )
  .onError(errorResponse)

/** Every route of the API, as the typed client sees it */
export type Api = typeof api
