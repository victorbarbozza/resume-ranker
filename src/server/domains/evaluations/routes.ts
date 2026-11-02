import { tbValidator } from '@hono/typebox-validator'
import { Hono } from 'hono'

import {
  getRanking,
  rankJob,
} from '@/server/domains/evaluations/services/rankings'
import { limitBody, rejectInvalid } from '@/server/shared/http/middleware'

import { jobIdParam, rankJobBody } from './routes.schemas'

/**
 * The ranking routes of a job, mounted under /api/jobs next to the job
 * routes. Chained in one expression, so the typed client knows every path,
 * input and answer.
 *
 * - `POST /:id/evaluations`: queues the candidates for the LLM; 202 with what was queued, or 409 while the job is being analysed
 * - `GET /:id/evaluations`: progress and every evaluation, best score first
 */
export const evaluationsRoutes = new Hono()
  .post(
    '/:id/evaluations',
    limitBody(),
    tbValidator('param', jobIdParam, rejectInvalid),
    tbValidator('json', rankJobBody, rejectInvalid),
    async (c) =>
      c.json(await rankJob(c.req.valid('param').id, c.req.valid('json')), 202)
  )
  .get(
    '/:id/evaluations',
    tbValidator('param', jobIdParam, rejectInvalid),
    async (c) => c.json(await getRanking(c.req.valid('param').id))
  )
