import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import { db, type Executor } from '@/server/shared/connectors/postgres'
import { jobs as jobsTable } from '@/server/shared/database/schema'
import type { IGeneratedBy } from '@/server/shared/schemas/generated-by.schema'
import type { IJob, IJobRequirements } from '@/server/shared/schemas/job.schema'
import type { Area } from '@/shared/areas'

/** A jobs row as Drizzle returns it */
type JobRow = typeof jobsTable.$inferSelect

/** Maps a row to the job the rest of the server sees */
const toJob = (row: JobRow): IJob => ({
  id: row.id,
  title: row.title,
  description: row.description,
  area: row.area,
  requirements: row.requirements,
  requirementsGeneratedBy:
    row.requirementsModel && row.requirementsPromptVersion
      ? {
          model: row.requirementsModel,
          promptVersion: row.requirementsPromptVersion,
        }
      : null,
  status: row.status,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

/** Filters out soft-deleted jobs */
const isLive = isNull(jobsTable.deletedAt)

/** What a person fills in to create a job */
export type CreateJobInput = {
  title: string
  description: string
  area: Area
}

/** Inserts a pending job at version 1; pass a transaction to enqueue its analysis with it */
export const create = async (
  input: CreateJobInput,
  executor: Executor = db
): Promise<IJob> => {
  const [row] = await executor.insert(jobsTable).values(input).returning()
  return toJob(row)
}

/** A live job by id */
export const findById = async (
  id: string,
  executor: Executor = db
): Promise<IJob | undefined> => {
  const [row] = await executor
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.id, id), isLive))
  return row ? toJob(row) : undefined
}

/** Every live job, newest first */
export const list = async (): Promise<IJob[]> => {
  const rows = await db
    .select()
    .from(jobsTable)
    .where(isLive)
    .orderBy(desc(jobsTable.createdAt))
  return rows.map(toJob)
}

/** Applies an edit, bumps the version and sends the job back to analysis */
export const update = async (
  id: string,
  changes: Partial<CreateJobInput>,
  executor: Executor = db
): Promise<IJob | undefined> => {
  const [row] = await executor
    .update(jobsTable)
    .set({
      ...changes,
      version: sql`${jobsTable.version} + 1`,
      status: 'pending',
      requirements: null,
      requirementsModel: null,
      requirementsPromptVersion: null,
    })
    .where(and(eq(jobsTable.id, id), isLive))
    .returning()
  return row ? toJob(row) : undefined
}

/** Stores the analysis of one version; an analysis of an older version is ignored */
export const saveAnalysis = async (
  id: string,
  version: number,
  requirements: IJobRequirements,
  generatedBy: IGeneratedBy
): Promise<boolean> => {
  const rows = await db
    .update(jobsTable)
    .set({
      requirements,
      requirementsModel: generatedBy.model,
      requirementsPromptVersion: generatedBy.promptVersion,
      status: 'ready',
    })
    .where(and(eq(jobsTable.id, id), eq(jobsTable.version, version)))
    .returning({ id: jobsTable.id })
  return rows.length > 0
}

/** Marks the analysis of one version as failed; ignored for an older version */
export const markAnalysisFailed = async (
  id: string,
  version: number
): Promise<boolean> => {
  const rows = await db
    .update(jobsTable)
    .set({ status: 'failed' })
    .where(and(eq(jobsTable.id, id), eq(jobsTable.version, version)))
    .returning({ id: jobsTable.id })
  return rows.length > 0
}

/** Hides a job from every read; the row stays */
export const softDelete = async (id: string): Promise<boolean> => {
  const rows = await db
    .update(jobsTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(jobsTable.id, id), isLive))
    .returning({ id: jobsTable.id })
  return rows.length > 0
}
