import { createHash, randomBytes } from 'node:crypto'
import { isIP } from 'node:net'

import * as rateLimitsRepo from '@/server/shared/database/repositories/rate-limits'
import * as sessionsRepo from '@/server/shared/database/repositories/sessions'
import * as usersRepo from '@/server/shared/database/repositories/users'
import { HTTPError } from '@/server/shared/http/http-error'

import { verifyPassword } from './passwords'

/** Name of the cookie that carries the session token */
export const SESSION_COOKIE = 'session'

/** How long a session lasts after the login */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

/** Failed logins one IP may make in a window; the next attempt answers 429 */
const MAX_FAILED_LOGINS = 10

/** Length of a login rate-limit window */
const LOGIN_WINDOW_MS = 5 * 60_000

/** The signed-in person, as the routes see them */
export type SessionUser = { id: string; username: string }

/** A live session: who is signed in, and the hash the database knows the session by */
export type CurrentSession = { idHash: string; user: SessionUser }

/** The database stores only this hash of a session token, never the token */
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex')

/** Stores a new 7-day session for a user and returns its token, the value of the cookie */
export const createSession = async (
  userId: string,
  ip: string | null
): Promise<string> => {
  const token = randomBytes(32).toString('base64url')
  await sessionsRepo.create({
    idHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    ip,
  })
  return token
}

/**
 * Signs a person in and returns the token of their new session.
 *
 * Each IP may fail 10 times in a 5-minute window. A slot is reserved before the
 * password check and given back when the login succeeds, so only failures
 * count, even when attempts arrive in parallel; the attempt after the 10th
 * failure answers 429 with Retry-After. The IP is the last address of
 * X-Forwarded-For, which the proxy in front of the app sets; without it, every
 * login shares one counter.
 */
export const login = async (
  credentials: { username: string; password: string },
  forwardedFor: string | undefined
): Promise<{ token: string; user: SessionUser }> => {
  const lastAddress = forwardedFor?.split(',').at(-1)?.trim() ?? ''
  const ip = isIP(lastAddress) ? lastAddress : null
  const key = `login:${ip ?? 'unknown'}`
  const now = Date.now()
  const windowStart = new Date(now - (now % LOGIN_WINDOW_MS))

  const attempts = await rateLimitsRepo.increment(key, windowStart)
  if (attempts > MAX_FAILED_LOGINS) {
    const secondsLeft = Math.ceil(
      (windowStart.getTime() + LOGIN_WINDOW_MS - now) / 1000
    )
    throw new HTTPError('too many failed logins; try again later', {
      statusCode: 429,
      code: 'TOO_MANY_LOGINS',
      headers: { 'Retry-After': String(secondsLeft) },
    })
  }

  const user = await usersRepo.findByUsernameWithHash(credentials.username)
  const valid = await verifyPassword(credentials.password, user?.passwordHash)
  if (!user || !valid) {
    throw new HTTPError('wrong username or password', {
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    })
  }

  await rateLimitsRepo.decrement(key, windowStart)
  const token = await createSession(user.id, ip)
  return { token, user: { id: user.id, username: user.username } }
}

/** The session behind a cookie token, unless it does not exist or has expired */
export const findSession = async (
  token: string
): Promise<CurrentSession | undefined> => {
  const idHash = hashToken(token)
  const session = await sessionsRepo.findActive(idHash)
  return session
    ? { idHash, user: { id: session.userId, username: session.username } }
    : undefined
}

/** Ends a session: its cookie no longer signs anyone in */
export const logout = (session: CurrentSession): Promise<void> =>
  sessionsRepo.remove(session.idHash)
