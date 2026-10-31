import { checkHealth } from '@/server/domains/health/services/health'
import { httpHandler } from '@/server/shared/http/handler'

// used by the compose healthcheck and the deploy; answers 500 when the database is down
export const handler = httpHandler(checkHealth)
