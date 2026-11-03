import { Compile } from 'typebox/compile'

import { evaluateCandidate } from '@/server/domains/evaluations/services/evaluate-candidate'
import * as evaluationsRepo from '@/server/shared/database/repositories/evaluations'
import type { TaskHandler } from '@/server/shared/queue/task-handler'
import { candidatesEvaluatePayloadSchema } from '@/server/shared/schemas/task.schema'

/** Checks a candidates.evaluate payload before it is used */
const payloadValidator = Compile(candidatesEvaluatePayloadSchema)

/** Handler of `candidates.evaluate`: the result of one candidate against one job, or a failed evaluation once the attempts run out */
export const candidatesEvaluateHandler: TaskHandler = {
  run: async (task) => {
    if (!payloadValidator.Check(task.payload)) {
      throw new Error('candidates.evaluate payload does not match its schema')
    }
    const { jobId, jobVersion, candidateId } = task.payload
    await evaluateCandidate(jobId, jobVersion, candidateId)
  },
  onDead: async (task) => {
    if (payloadValidator.Check(task.payload)) {
      const { jobId, jobVersion, candidateId } = task.payload
      await evaluationsRepo.markFailed(jobId, jobVersion, [candidateId])
    }
  },
}
