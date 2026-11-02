import { uploadResumes } from '@/server/domains/candidates/services/upload-resumes'
import { httpHandler } from '@/server/shared/http/handler'
import {
  RESUME_FILE_MAX_BYTES,
  UPLOAD_MAX_FILES,
} from '@/server/shared/schemas/candidate.schema'

import { uploadResumesEventSchema } from './upload-resumes.schemas'

/** The largest upload: every file at the limit, plus room for the multipart boundaries */
const UPLOAD_MAX_BODY_BYTES =
  UPLOAD_MAX_FILES * RESUME_FILE_MAX_BYTES + 1024 * 1024

/** Stores the files and queues their profiles; answers 202 with what happened to each file */
export const handler = httpHandler((event) => uploadResumes(event.body.files), {
  eventSchema: uploadResumesEventSchema,
  successStatusCode: 202,
  maxBodyBytes: UPLOAD_MAX_BODY_BYTES,
})
