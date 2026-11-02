import { checkConnection } from '@/server/shared/connectors/postgres'

/** Answer of the health check */
export type HealthStatus = { status: 'ok' }

/** Pings the database; throws when it cannot answer */
export const checkHealth = async (): Promise<HealthStatus> => {
  await checkConnection()
  return { status: 'ok' }
}
