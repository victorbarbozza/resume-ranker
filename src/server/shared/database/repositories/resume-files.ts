import { eq } from 'drizzle-orm'

import { db, type Executor } from '@/server/shared/connectors/postgres'
import { resumeFiles as resumeFilesTable } from '@/server/shared/database/schema'

/**
 * Where the original upload of a candidate lives.
 *
 * - `storageKey`: the key of the bytes in the file storage
 */
export type ResumeFile = {
  storageKey: string
  mimeType: string
  sizeBytes: number
}

/** Records where the original upload lives; pass the upload transaction */
export const create = async (
  candidateId: string,
  file: ResumeFile,
  executor: Executor = db
): Promise<void> => {
  await executor.insert(resumeFilesTable).values({ candidateId, ...file })
}

/** Where the original upload of a candidate lives, when recorded */
export const findByCandidateId = async (
  candidateId: string
): Promise<ResumeFile | undefined> => {
  const [row] = await db
    .select({
      storageKey: resumeFilesTable.storageKey,
      mimeType: resumeFilesTable.mimeType,
      sizeBytes: resumeFilesTable.sizeBytes,
    })
    .from(resumeFilesTable)
    .where(eq(resumeFilesTable.candidateId, candidateId))
  return row
}
