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
 * What happened to each file of an upload.
 *
 * - `accepted`: stored, with its profile queued
 * - `duplicates`: the same file is already in the base; nothing new was stored
 * - `rejected`: not stored, with the reason
 */
export type UploadSummary = {
  accepted: { fileName: string; candidateId: string }[]
  duplicates: { fileName: string; candidateId: string }[]
  rejected: { fileName: string; error: string }[]
}

/**
 * Stores every file of an upload and queues the profile of each new one. A
 * file is written to the storage first, under a key made from its sha256,
 * then its candidate, file record and task go in one transaction; so the
 * answer only comes once every accepted file is safe, and the slow part, text
 * and LLM, runs in the worker. A file that fails a check is rejected on its
 * own and the others go on.
 */
export const uploadResumes = async (
  files: UploadedFile[]
): Promise<UploadSummary> => {
  const summary: UploadSummary = { accepted: [], duplicates: [], rejected: [] }

  for (const file of files) {
    const fileName = file.name.slice(0, FILE_NAME_MAX_LENGTH)
    const sizeBytes = file.bytes.byteLength
    if (sizeBytes === 0 || sizeBytes > RESUME_FILE_MAX_BYTES) {
      summary.rejected.push({
        fileName,
        error: 'the file must have between 1 byte and 2 MB',
      })
      continue
    }
    const mimeType = detectResumeType(fileName, file.bytes)
    if (!mimeType) {
      summary.rejected.push({
        fileName,
        error: 'only PDF, DOCX and plain text files are accepted',
      })
      continue
    }

    const contentHash = createHash('sha256').update(file.bytes).digest('hex')
    const existing = await candidatesRepo.findByContentHash(contentHash)
    if (existing) {
      summary.duplicates.push({ fileName, candidateId: existing.id })
      continue
    }

    const storageKey = `resumes:${contentHash}`
    await putFile(storageKey, file.bytes)
    const candidate = await db.transaction(async (tx) => {
      const created = await candidatesRepo.create({ fileName, contentHash }, tx)
      if (created) {
        await resumeFilesRepo.create(
          created.id,
          { storageKey, mimeType, sizeBytes },
          tx
        )
        await tasksRepo.enqueue(
          'candidate.extract_profile',
          { candidateId: created.id },
          tx
        )
      }
      return created
    })

    if (candidate) {
      summary.accepted.push({ fileName, candidateId: candidate.id })
      continue
    }
    const winner = await candidatesRepo.findByContentHash(contentHash)
    if (winner) {
      summary.duplicates.push({ fileName, candidateId: winner.id })
    } else {
      summary.rejected.push({
        fileName,
        error: 'the same file was being uploaded and removed; send it again',
      })
    }
  }

  return summary
}
