import { Type } from 'typebox'

import { listCandidates } from '@/server/domains/candidates/services/candidates'
import { httpHandler } from '@/server/shared/http/handler'

/** Every live candidate with its status, newest first */
export const handler = httpHandler(
  async () => ({ candidates: await listCandidates() }),
  { eventSchema: Type.Object({}) }
)
