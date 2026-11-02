import { Compile } from 'typebox/compile'

import { evaluateBatch } from '@/server/domains/evaluations/services/evaluate-batch'
import * as evaluationsRepo from '@/server/shared/database/repositories/evaluations'
import type { TaskHandler } from '@/server/shared/queue/task-handler'
import { candidatesEvaluatePayloadSchema } from '@/server/shared/schemas/task.schema'

/** Checks a candidates.evaluate payload before it is used */
const payloadValidator = Compile(candidatesEvaluatePayloadSchema)

/** Handler of `candidates.evaluate`: the scores of one batch, or failed evaluations once the attempts run out */
export const candidatesEvaluateHandler: TaskHandler = {
  run: async (task) => {
    if (!payloadValidator.Check(task.payload)) {
      throw new Error('candidates.evaluate payload does not match its schema')
    }
    const { jobId, jobVersion, candidateIds } = task.payload
    await evaluateBatch(jobId, jobVersion, candidateIds)
  },
  onDead: async (task) => {
    if (payloadValidator.Check(task.payload)) {
      const { jobId, jobVersion, candidateIds } = task.payload
      await evaluationsRepo.markFailed(jobId, jobVersion, candidateIds)
    }
  },
}
