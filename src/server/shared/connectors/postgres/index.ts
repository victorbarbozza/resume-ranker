import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { databaseUrl } from '@/server/config/env'
import * as schema from '@/server/shared/database/schema'

// `next dev` re-evaluates modules on every change; keeping the client on
// globalThis stops each reload from opening a new connection pool
const globalForPostgres = globalThis as typeof globalThis & {
  postgresClient?: ReturnType<typeof postgres>
}

const client =
  globalForPostgres.postgresClient ?? postgres(databaseUrl, { max: 5 })
if (process.env.NODE_ENV !== 'production') {
  globalForPostgres.postgresClient = client
}

export const db = drizzle(client, { schema })

/** Throws when the database cannot answer a trivial query */
export const checkConnection = async (): Promise<void> => {
  await client`select 1`
}
