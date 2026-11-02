import { Compile } from 'typebox/compile'

import { analyzeJob } from '@/server/domains/jobs/services/analyze-job'
import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import type { TaskHandler } from '@/server/shared/queue/task-handler'
import { jobAnalyzePayloadSchema } from '@/server/shared/schemas/task.schema'

/** Checks a job.analyze payload before it is used */
const payloadValidator = Compile(jobAnalyzePayloadSchema)

/** Handler of `job.analyze`: the requirements of one job version, or a failed job once the attempts run out */
export const jobAnalyzeHandler: TaskHandler = {
  run: async (task) => {
    if (!payloadValidator.Check(task.payload)) {
      throw new Error('job.analyze payload does not match its schema')
    }
    await analyzeJob(task.payload.jobId, task.payload.version)
  },
  onDead: async (task) => {
    if (payloadValidator.Check(task.payload)) {
      await jobsRepo.markAnalysisFailed(
        task.payload.jobId,
        task.payload.version
      )
    }
  },
}
