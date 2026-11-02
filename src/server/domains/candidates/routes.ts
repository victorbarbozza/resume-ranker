import { tbValidator } from '@hono/typebox-validator'
import { Hono } from 'hono'

import {
  deleteCandidate,
  listCandidates,
  retryProfile,
} from '@/server/domains/candidates/services/candidates'
import { uploadResumes } from '@/server/domains/candidates/services/upload-resumes'
import { limitBody, rejectInvalid } from '@/server/shared/http/middleware'
import { RESUME_FILE_MAX_BYTES, UPLOAD_MAX_FILES } from '@/shared/limits'

import { candidateIdParam, uploadResumesForm } from './routes.schemas'

/**
 * The candidate routes, under /api/candidates. Chained in one expression, so
 * the typed client knows every path, input and answer.
 *
 * - `POST /`: stores the files and queues their profiles; 202 with one result per file, in the order sent. The body may hold every file at the limit, plus 1 MB for the multipart boundaries
 * - `POST /:id/retry`: queues a failed profile again; 202, or 409 when it did not fail
 * - `DELETE /:id`: soft delete; 204
 */
export const candidatesRoutes = new Hono()
  .get('/', async (c) => c.json({ candidates: await listCandidates() }))
  .post(
    '/',
    limitBody(UPLOAD_MAX_FILES * RESUME_FILE_MAX_BYTES + 1024 * 1024),
    tbValidator('form', uploadResumesForm, rejectInvalid),
    async (c) => {
      const files = [c.req.valid('form').files].flat()
      return c.json({ results: await uploadResumes(files) }, 202)
    }
  )
  .post(
    '/:id/retry',
    tbValidator('param', candidateIdParam, rejectInvalid),
    async (c) => c.json(await retryProfile(c.req.valid('param').id), 202)
  )
  .delete(
    '/:id',
    tbValidator('param', candidateIdParam, rejectInvalid),
    async (c) => {
      await deleteCandidate(c.req.valid('param').id)
      return c.body(null, 204)
    }
  )
