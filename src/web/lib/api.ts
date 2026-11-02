import { hc } from 'hono/client'

import type { Api } from '@/server/api'

/**
 * The API, with every path, input and answer typed from the server's routes,
 * such as `client.api.jobs.$post({ json })`. Calls go to the same origin:
 * the server in the image, the Vite proxy in development.
 */
export const client = hc<Api>('/')
