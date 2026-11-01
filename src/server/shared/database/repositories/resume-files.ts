import { eq } from 'drizzle-orm'

import { db, type Executor } from '@/server/shared/connectors/postgres'
import { resumeFiles as resumeFilesTable } from '@/server/shared/database/schema'

/** The original upload of a candidate */
export type ResumeFile = {
  content: Buffer
  mimeType: string
  sizeBytes: number
}

/** Stores the original upload; pass the upload transaction */
export const create = async (
  candidateId: string,
  file: { content: Buffer; mimeType: string },
  executor: Executor = db
): Promise<void> => {
  await executor.insert(resumeFilesTable).values({
    candidateId,
    content: file.content,
    mimeType: file.mimeType,
    sizeBytes: file.content.byteLength,
  })
}

/** The original upload of a candidate, when stored */
export const findByCandidateId = async (
  candidateId: string
): Promise<ResumeFile | undefined> => {
  const [row] = await db
    .select({
      content: resumeFilesTable.content,
      mimeType: resumeFilesTable.mimeType,
      sizeBytes: resumeFilesTable.sizeBytes,
    })
    .from(resumeFilesTable)
    .where(eq(resumeFilesTable.candidateId, candidateId))
  return row
}
