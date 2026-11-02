import { Compile } from 'typebox/compile'

import { extractProfile } from '@/server/domains/candidates/services/extract-profile'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import type { TaskHandler } from '@/server/shared/queue/task-handler'
import { candidateExtractProfilePayloadSchema } from '@/server/shared/schemas/task.schema'

/** Checks a candidate.extract_profile payload before it is used */
const payloadValidator = Compile(candidateExtractProfilePayloadSchema)

/** Handler of `candidate.extract_profile`: the text and profile of one resume, or a failed candidate once the attempts run out */
export const candidateExtractProfileHandler: TaskHandler = {
  run: async (task) => {
    if (!payloadValidator.Check(task.payload)) {
      throw new Error(
        'candidate.extract_profile payload does not match its schema'
      )
    }
    const today = new Date().toISOString().slice(0, 10)
    await extractProfile(task.payload.candidateId, today)
  },
  onDead: async (task) => {
    if (payloadValidator.Check(task.payload)) {
      await candidatesRepo.setStatus(task.payload.candidateId, 'failed')
    }
  },
}
