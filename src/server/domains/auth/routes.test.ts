import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from 'bun:test'

import { api } from '@/server/api'
import { hashPassword } from '@/server/domains/auth/services/passwords'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { createUser, signedInHeaders } from '@/server/test/fixtures'

const password = 'correct horse battery staple'
let passwordHash: string

beforeAll(async () => {
  await prepareTestDatabase()
  passwordHash = await hashPassword(password)
})
beforeEach(resetDatabase)
afterEach(() => setSystemTime())

const login = (username: string, attempt: string, ip = '203.0.113.7') =>
  api.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password: attempt }),
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': `198.51.100.1, ${ip}`,
    },
  })

const statusesOf = async (attempts: (Response | Promise<Response>)[]) =>
  (await Promise.all(attempts)).map((response) => response.status)

describe('POST /api/auth/login', () => {
  test('signs in with the right password and sets the session cookie', async () => {
    const user = await createUser(passwordHash)

    const response = await login(user.username, password)
    const cookie = response.headers.get('Set-Cookie') ?? ''
    const me = await api.request('/api/auth/me', {
      headers: { Cookie: cookie.split(';')[0] },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: user.id,
      username: user.username,
    })
    expect(cookie).toMatch(/^session=[\w-]{43};/)
    for (const attribute of [
      'Max-Age=604800',
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
    ]) {
      expect(cookie).toContain(attribute)
    }
    expect(await me.json()).toEqual({ id: user.id, username: user.username })
  })

  test('answers a wrong password and an unknown username alike', async () => {
    const user = await createUser(passwordHash)

    for (const response of [
      await login(user.username, 'wrong password'),
      await login('nobody', password),
    ]) {
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        error: 'INVALID_CREDENTIALS',
        message: 'wrong username or password',
      })
    }
  })

  test('answers 429 with Retry-After once an IP fails 10 times in 5 minutes', async () => {
    setSystemTime(new Date('2026-11-02T12:01:00Z'))
    const user = await createUser(passwordHash)

    const failures = await statusesOf(
      Array.from({ length: 10 }, () => login(user.username, 'wrong password'))
    )
    const blocked = await login(user.username, password)
    const otherIp = await login(user.username, password, '192.0.2.44')

    expect(failures).toEqual(Array(10).fill(401))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBe('240')
    expect((await blocked.json()).error).toBe('TOO_MANY_LOGINS')
    expect(otherIp.status).toBe(200)
  })

  test('counts only failures: a successful login gives its slot back', async () => {
    setSystemTime(new Date('2026-11-02T12:01:00Z'))
    const user = await createUser(passwordHash)

    const failures = await statusesOf(
      Array.from({ length: 9 }, () => login(user.username, 'wrong password'))
    )
    const successes = []
    for (let i = 0; i < 5; i++) {
      successes.push((await login(user.username, password)).status)
    }
    const tenthFailure = await login(user.username, 'wrong password')
    const blocked = await login(user.username, password)

    expect(failures).toEqual(Array(9).fill(401))
    expect(successes).toEqual(Array(5).fill(200))
    expect(tenthFailure.status).toBe(401)
    expect(blocked.status).toBe(429)
  })
})

describe('POST /api/auth/logout', () => {
  test('deletes the session and clears the cookie', async () => {
    const signedIn = await signedInHeaders()

    const response = await api.request('/api/auth/logout', {
      method: 'POST',
      headers: signedIn,
    })
    const me = await api.request('/api/auth/me', { headers: signedIn })

    expect(response.status).toBe(204)
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0')
    expect(me.status).toBe(401)
  })
})

describe('session middleware', () => {
  test('every route but health and login answers 401 without a session', async () => {
    const routes = new Set(
      api.routes
        .filter(({ method }) => method !== 'ALL')
        .map(({ method, path }) => `${method} ${path}`)
    )
    routes.delete('GET /api/health')
    routes.delete('POST /api/auth/login')

    const statuses = []
    for (const route of routes) {
      const [method, path] = route.split(' ')
      const response = await api.request(
        path.replace(':id', crypto.randomUUID()),
        {
          method,
          body: method === 'GET' ? undefined : '{}',
          headers: { 'Content-Type': 'application/json' },
        }
      )
      statuses.push([route, response.status])
    }

    expect(routes.size).toBeGreaterThan(10)
    expect(statuses).toEqual([...routes].map((route) => [route, 401]))
  })

  test('answers 401 to a session cookie the database does not know', async () => {
    const response = await api.request('/api/jobs', {
      headers: { Cookie: 'session=forged' },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: 'UNAUTHENTICATED',
      message: 'sign in to continue',
    })
  })

  test('leaves the health check public', async () => {
    expect((await api.request('/api/health')).status).toBe(200)
  })
})

describe('CSRF check', () => {
  test('refuses a form request from another site and lets the same site through', async () => {
    const { Cookie } = await signedInHeaders()
    const logout = (headers: Record<string, string>) =>
      api.request('/api/auth/logout', {
        method: 'POST',
        headers: { Cookie, ...headers },
      })

    const otherOrigin = await logout({ Origin: 'https://evil.example' })
    const crossSite = await logout({ 'Sec-Fetch-Site': 'cross-site' })
    const sameOrigin = await logout({ 'Sec-Fetch-Site': 'same-origin' })

    expect(otherOrigin.status).toBe(403)
    expect(await otherOrigin.json()).toEqual({
      error: 'ERR_FORBIDDEN',
      message: 'request refused',
    })
    expect(crossSite.status).toBe(403)
    expect(sameOrigin.status).toBe(204)
  })
})
