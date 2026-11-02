import { uploadResumes } from '@/server/domains/candidates/services/upload-resumes'
import { httpHandler } from '@/server/shared/http/handler'
import {
  RESUME_FILE_MAX_BYTES,
  UPLOAD_MAX_FILES,
} from '@/server/shared/schemas/candidate.schema'

import { uploadResumesEventSchema } from './upload-resumes.schemas'

/**
 * Stores the files and queues their profiles; answers 202 with what happened
 * to each file, in the order they were sent. The body may hold every file at
 * the limit, plus 1 MB for the multipart boundaries.
 */
export const handler = httpHandler(
  async (event) => ({ results: await uploadResumes(event.body.files) }),
  {
    eventSchema: uploadResumesEventSchema,
    successStatusCode: 202,
    maxBodyBytes: UPLOAD_MAX_FILES * RESUME_FILE_MAX_BYTES + 1024 * 1024,
  }
)
