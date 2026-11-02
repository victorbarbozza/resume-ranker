import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'

import {
  type CurrentSession,
  findSession,
  SESSION_COOKIE,
} from '@/server/domains/auth/services/sessions'
import { HTTPError } from '@/server/shared/http/http-error'

/** What the session middleware hands the routes after it: the live session, as `c.var.session` */
export type SessionEnv = { Variables: { session: CurrentSession } }

/** Routes anyone can call: the health check, for compose and the deploy, and the login itself */
const PUBLIC_ROUTES = ['GET /api/health', 'POST /api/auth/login']

/**
 * Runs before every API route. A public route goes on; any other needs the
 * cookie of a live session, or answers 401 and never runs. A new route is
 * protected unless it is added to PUBLIC_ROUTES.
 */
export const requireSession = createMiddleware<SessionEnv>(async (c, next) => {
  if (PUBLIC_ROUTES.includes(`${c.req.method} ${c.req.path}`)) return next()

  const token = getCookie(c, SESSION_COOKIE)
  const session = token ? await findSession(token) : undefined
  if (!session) {
    throw new HTTPError('sign in to continue', {
      statusCode: 401,
      code: 'UNAUTHENTICATED',
    })
  }
  c.set('session', session)
  return next()
})
