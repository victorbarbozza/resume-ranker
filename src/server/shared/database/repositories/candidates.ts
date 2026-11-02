import { and, arrayContains, desc, eq, isNull } from 'drizzle-orm'

import { db, type Executor } from '@/server/shared/connectors/postgres'
import { candidates as candidatesTable } from '@/server/shared/database/schema'
import type {
  CandidateStatus,
  ICandidate,
  ICandidateProfile,
} from '@/server/shared/schemas/candidate.schema'
import type { IGeneratedBy } from '@/server/shared/schemas/generated-by.schema'
import type { Area } from '@/shared/areas'

/** Every column a candidate exposes; the resume text is read only by the LLM tasks */
const candidateColumns = {
  id: candidatesTable.id,
  name: candidatesTable.name,
  fileName: candidatesTable.fileName,
  contentHash: candidatesTable.contentHash,
  profile: candidatesTable.profile,
  profileModel: candidatesTable.profileModel,
  profilePromptVersion: candidatesTable.profilePromptVersion,
  areas: candidatesTable.areas,
  status: candidatesTable.status,
  createdAt: candidatesTable.createdAt,
  updatedAt: candidatesTable.updatedAt,
}

/** A candidates row as candidateColumns reads it */
type CandidateRow = {
  id: string
  name: string | null
  fileName: string
  contentHash: string
  profile: ICandidateProfile | null
  profileModel: string | null
  profilePromptVersion: string | null
  areas: Area[]
  status: CandidateStatus
  createdAt: Date
  updatedAt: Date
}

/** Maps a row to the candidate the rest of the server sees */
const toCandidate = (row: CandidateRow): ICandidate => ({
  id: row.id,
  name: row.name,
  fileName: row.fileName,
  contentHash: row.contentHash,
  profile: row.profile,
  profileGeneratedBy:
    row.profileModel && row.profilePromptVersion
      ? { model: row.profileModel, promptVersion: row.profilePromptVersion }
      : null,
  areas: row.areas,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

/** Filters out soft-deleted candidates */
const isLive = isNull(candidatesTable.deletedAt)

/** Live, ready candidates of an area; a candidate with two areas belongs to both */
const readyInArea = (area: Area) =>
  and(
    isLive,
    eq(candidatesTable.status, 'ready'),
    arrayContains(candidatesTable.areas, [area])
  )

/** What an upload stores before any processing */
export type CreateCandidateInput = {
  fileName: string
  contentHash: string
}

/**
 * Inserts a pending candidate; pass the upload transaction. Returns undefined
 * when a live candidate already has the same file, which two uploads of one
 * file at the same time can cause.
 */
export const create = async (
  input: CreateCandidateInput,
  executor: Executor = db
): Promise<ICandidate | undefined> => {
  const [row] = await executor
    .insert(candidatesTable)
    .values(input)
    .onConflictDoNothing()
    .returning(candidateColumns)
  return row ? toCandidate(row) : undefined
}

/** A live candidate by id */
export const findById = async (
  id: string,
  executor: Executor = db
): Promise<ICandidate | undefined> => {
  const [row] = await executor
    .select(candidateColumns)
    .from(candidatesTable)
    .where(and(eq(candidatesTable.id, id), isLive))
  return row ? toCandidate(row) : undefined
}

/** A live candidate by the sha256 of its file, which makes uploads idempotent */
export const findByContentHash = async (
  contentHash: string,
  executor: Executor = db
): Promise<ICandidate | undefined> => {
  const [row] = await executor
    .select(candidateColumns)
    .from(candidatesTable)
    .where(and(eq(candidatesTable.contentHash, contentHash), isLive))
  return row ? toCandidate(row) : undefined
}

/**
 * The full resume text, read only by the LLM tasks: null until the worker
 * extracts it from the file, undefined when the candidate is not live.
 */
export const findResumeText = async (
  id: string,
  executor: Executor = db
): Promise<string | null | undefined> => {
  const [row] = await executor
    .select({ resumeText: candidatesTable.resumeText })
    .from(candidatesTable)
    .where(and(eq(candidatesTable.id, id), isLive))
  return row?.resumeText
}

/** Stores the text the worker extracted from the file */
export const saveResumeText = async (
  id: string,
  resumeText: string
): Promise<boolean> => {
  const rows = await db
    .update(candidatesTable)
    .set({ resumeText })
    .where(and(eq(candidatesTable.id, id), isLive))
    .returning({ id: candidatesTable.id })
  return rows.length > 0
}

/** Every live candidate, newest first */
export const list = async (): Promise<ICandidate[]> => {
  const rows = await db
    .select(candidateColumns)
    .from(candidatesTable)
    .where(isLive)
    .orderBy(desc(candidatesTable.createdAt))
  return rows.map(toCandidate)
}

/**
 * The candidates a ranking sends to the LLM: ready candidates of the job's
 * area, newest first, up to the limit.
 */
export const listReadyByArea = async (
  area: Area,
  limit: number
): Promise<ICandidate[]> => {
  const rows = await db
    .select(candidateColumns)
    .from(candidatesTable)
    .where(readyInArea(area))
    .orderBy(desc(candidatesTable.createdAt))
    .limit(limit)
  return rows.map(toCandidate)
}

/** How many ready candidates an area has, so a ranking can say how many the limit left out */
export const countReadyByArea = async (area: Area): Promise<number> =>
  db.$count(candidatesTable, readyInArea(area))

/** What the LLM extracted from a resume, and what produced it */
export type SaveProfileInput = {
  name: string | null
  profile: ICandidateProfile
  areas: Area[]
  generatedBy: IGeneratedBy
}

/** Stores what the LLM extracted and marks the candidate ready for ranking */
export const saveProfile = async (
  id: string,
  { name, profile, areas, generatedBy }: SaveProfileInput
): Promise<boolean> => {
  const rows = await db
    .update(candidatesTable)
    .set({
      name,
      profile,
      areas,
      profileModel: generatedBy.model,
      profilePromptVersion: generatedBy.promptVersion,
      status: 'ready',
    })
    .where(and(eq(candidatesTable.id, id), isLive))
    .returning({ id: candidatesTable.id })
  return rows.length > 0
}

/** Moves a live candidate to another status */
export const setStatus = async (
  id: string,
  status: CandidateStatus,
  executor: Executor = db
): Promise<boolean> => {
  const rows = await executor
    .update(candidatesTable)
    .set({ status })
    .where(and(eq(candidatesTable.id, id), isLive))
    .returning({ id: candidatesTable.id })
  return rows.length > 0
}

/**
 * Sends a failed profile back to pending, for another try. Returns undefined
 * when the candidate is gone or its profile did not fail.
 */
export const reopenFailedProfile = async (
  id: string,
  executor: Executor = db
): Promise<ICandidate | undefined> => {
  const [row] = await executor
    .update(candidatesTable)
    .set({ status: 'pending' })
    .where(
      and(
        eq(candidatesTable.id, id),
        isLive,
        eq(candidatesTable.status, 'failed')
      )
    )
    .returning(candidateColumns)
  return row ? toCandidate(row) : undefined
}

/** Hides a candidate from every read; the row and its file stay */
export const softDelete = async (id: string): Promise<boolean> => {
  const rows = await db
    .update(candidatesTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(candidatesTable.id, id), isLive))
    .returning({ id: candidatesTable.id })
  return rows.length > 0
}
