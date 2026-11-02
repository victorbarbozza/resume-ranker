import { Hono } from 'hono'

import { checkHealth } from '@/server/domains/health/services/health'

/** GET /api/health: pings the database for compose and the deploy; 500 when it cannot answer */
export const healthRoutes = new Hono().get('/', async (c) =>
  c.json(await checkHealth())
)
