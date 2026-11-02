import { tbValidator } from '@hono/typebox-validator'
import { Hono } from 'hono'

import {
  createJob,
  deleteJob,
  getJob,
  listJobs,
  retryAnalysis,
  updateJob,
} from '@/server/domains/jobs/services/jobs'
import { limitBody, rejectInvalid } from '@/server/shared/http/middleware'

import { createJobBody, jobIdParam, updateJobBody } from './routes.schemas'

/**
 * The job routes, under /api/jobs. Chained in one expression, so the typed
 * client knows every path, input and answer.
 *
 * - `POST /`: stores the job and queues its analysis; 201 with the pending job
 * - `PATCH /:id`: bumps the version and queues a new analysis
 * - `DELETE /:id`: soft delete; 204
 * - `POST /:id/retry`: queues a failed analysis again; 202, or 409 when it did not fail
 */
export const jobsRoutes = new Hono()
  .get('/', async (c) => c.json({ jobs: await listJobs() }))
  .post(
    '/',
    limitBody(),
    tbValidator('json', createJobBody, rejectInvalid),
    async (c) => c.json(await createJob(c.req.valid('json')), 201)
  )
  .get('/:id', tbValidator('param', jobIdParam, rejectInvalid), async (c) =>
    c.json(await getJob(c.req.valid('param').id))
  )
  .patch(
    '/:id',
    limitBody(),
    tbValidator('param', jobIdParam, rejectInvalid),
    tbValidator('json', updateJobBody, rejectInvalid),
    async (c) =>
      c.json(await updateJob(c.req.valid('param').id, c.req.valid('json')))
  )
  .delete(
    '/:id',
    tbValidator('param', jobIdParam, rejectInvalid),
    async (c) => {
      await deleteJob(c.req.valid('param').id)
      return c.body(null, 204)
    }
  )
  .post(
    '/:id/retry',
    tbValidator('param', jobIdParam, rejectInvalid),
    async (c) => c.json(await retryAnalysis(c.req.valid('param').id), 202)
  )
