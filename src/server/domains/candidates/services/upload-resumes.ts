import { createHash } from 'node:crypto'

import { db } from '@/server/shared/connectors/postgres'
import { putFile } from '@/server/shared/connectors/storage'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as resumeFilesRepo from '@/server/shared/database/repositories/resume-files'
import * as tasksRepo from '@/server/shared/database/repositories/tasks'
import type { UploadedFile } from '@/server/shared/http/uploaded-file'
import {
  FILE_NAME_MAX_LENGTH,
  RESUME_FILE_MAX_BYTES,
} from '@/server/shared/schemas/candidate.schema'

import { detectResumeType } from './resume-type'

/**
 * What happened to one file of an upload.
 *
 * - `accepted`: stored, with its profile queued
 * - `duplicate`: a live candidate already has the same file
 * - `rejected`: not stored, with the reason
 */
export type UploadResult =
  | { fileName: string; status: 'accepted' | 'duplicate'; candidateId: string }
  | { fileName: string; status: 'rejected'; error: string }

/**
 * Stores one file and queues its profile. The file goes to the storage under
 * its sha256 first, so storing it twice is harmless; then the candidate, file
 * record and task go in one transaction. A live candidate with the same file,
 * from an earlier upload or one running now, makes this file a duplicate.
 */
const uploadResume = async (file: UploadedFile): Promise<UploadResult> => {
  const fileName = file.name.slice(0, FILE_NAME_MAX_LENGTH)
  const sizeBytes = file.bytes.byteLength
  if (sizeBytes === 0 || sizeBytes > RESUME_FILE_MAX_BYTES) {
    return {
      fileName,
      status: 'rejected',
      error: 'the file must have between 1 byte and 2 MB',
    }
  }
  const mimeType = await detectResumeType(file.bytes)
  if (!mimeType) {
    return {
      fileName,
      status: 'rejected',
      error: 'only PDF and DOCX files are accepted',
    }
  }

  const contentHash = createHash('sha256').update(file.bytes).digest('hex')
  const storageKey = `resumes:${contentHash}`
  await putFile(storageKey, file.bytes)

  const created = await db.transaction(async (tx) => {
    const candidate = await candidatesRepo.create({ fileName, contentHash }, tx)
    if (!candidate) return undefined
    await resumeFilesRepo.create(
      candidate.id,
      { storageKey, mimeType, sizeBytes },
      tx
    )
    await tasksRepo.enqueue(
      'candidate.extract_profile',
      { candidateId: candidate.id },
      tx
    )
    return candidate
  })
  if (created) {
    return { fileName, status: 'accepted', candidateId: created.id }
  }

  const existing = await candidatesRepo.findByContentHash(contentHash)
  if (!existing) {
    throw new Error('the same file was uploaded and removed at once')
  }
  return { fileName, status: 'duplicate', candidateId: existing.id }
}

/**
 * Uploads every file in the order it was sent. The answer comes only once
 * every accepted file is stored; the slow part, text and LLM, runs in the
 * worker. A file the storage or the database cannot take is rejected on its
 * own and the rest go on; sending it again is safe, since a stored file is a
 * duplicate.
 */
export const uploadResumes = async (
  files: UploadedFile[]
): Promise<UploadResult[]> => {
  const results: UploadResult[] = []
  for (const file of files) {
    try {
      results.push(await uploadResume(file))
    } catch (error) {
      console.error(`✗ upload of ${file.name} failed`, error)
      results.push({
        fileName: file.name,
        status: 'rejected',
        error: 'the file could not be stored; send it again',
      })
    }
  }
  return results
}
