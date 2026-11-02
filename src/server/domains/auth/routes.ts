import { tbValidator } from '@hono/typebox-validator'
import { Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'

import type { SessionEnv } from '@/server/domains/auth/middleware'
import {
  login,
  logout,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from '@/server/domains/auth/services/sessions'
import { limitBody, rejectInvalid } from '@/server/shared/http/middleware'

import { loginBody } from './routes.schemas'

/**
 * The auth routes, under /api/auth. Login is public; logout and me run after
 * the session middleware, which hands them the session.
 *
 * - `POST /login`: 200 with the user and the session cookie; 401 on a wrong username or password; 429 after 10 failures from one IP in 5 minutes
 * - `POST /logout`: deletes the session and clears the cookie; 204
 * - `GET /me`: the signed-in user
 */
export const authRoutes = new Hono<SessionEnv>()
  .post(
    '/login',
    limitBody(),
    tbValidator('json', loginBody, rejectInvalid),
    async (c) => {
      const { token, user } = await login(
        c.req.valid('json'),
        c.req.header('x-forwarded-for')
      )
      setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: SESSION_TTL_SECONDS,
      })
      return c.json(user)
    }
  )
  .post('/logout', async (c) => {
    await logout(c.var.session)
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true })
    return c.body(null, 204)
  })
  .get('/me', (c) => c.json(c.var.session.user))
