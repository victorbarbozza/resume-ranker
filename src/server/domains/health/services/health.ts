import { checkConnection } from '@/server/shared/connectors/postgres'

export type HealthStatus = { status: 'ok' }

export const checkHealth = async (): Promise<HealthStatus> => {
  await checkConnection()
  return { status: 'ok' }
}
