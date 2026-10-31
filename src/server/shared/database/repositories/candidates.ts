import {
  and,
  arrayContains,
  desc,
  eq,
  getTableColumns,
  isNull,
} from 'drizzle-orm'

import { db, type Executor } from '@/server/shared/connectors/postgres'
import { candidates as candidatesTable } from '@/server/shared/database/schema'
import type {
  CandidateStatus,
  ICandidate,
  ICandidateProfile,
} from '@/server/shared/schemas/candidate.schema'
import type { IGeneratedBy } from '@/server/shared/schemas/generated-by.schema'
import {
  anyTermQuery,
  eitherQuery,
  matches,
  rank,
  searchDocument,
} from '@/server/shared/search/search'
import type { Area } from '@/shared/areas'

/** Every column a candidate exposes: the resume text is read only by the LLM tasks, the search document only by the shortlist */
const {
  resumeText: _resumeText,
  searchVector: _searchVector,
  deletedAt: _deletedAt,
  ...candidateColumns
} = getTableColumns(candidatesTable)

/** A candidates row without the columns a candidate never exposes */
type CandidateRow = Omit<
  typeof candidatesTable.$inferSelect,
  'resumeText' | 'searchVector' | 'deletedAt'
>

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

/** What an upload stores before any processing */
export type CreateCandidateInput = {
  fileName: string
  contentHash: string
  resumeText: string
}

/** Inserts a pending candidate; pass the upload transaction */
export const create = async (
  input: CreateCandidateInput,
  executor: Executor = db
): Promise<ICandidate> => {
  const [row] = await executor
    .insert(candidatesTable)
    .values(input)
    .returning(candidateColumns)
  return toCandidate(row)
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

/** The full resume text, read only by the LLM tasks */
export const findResumeText = async (
  id: string,
  executor: Executor = db
): Promise<string | undefined> => {
  const [row] = await executor
    .select({ resumeText: candidatesTable.resumeText })
    .from(candidatesTable)
    .where(and(eq(candidatesTable.id, id), isLive))
  return row?.resumeText
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

/** What the LLM extracted from a resume, and what produced it */
export type SaveProfileInput = {
  name: string | null
  profile: ICandidateProfile
  areas: Area[]
  generatedBy: IGeneratedBy
}

/**
 * Stores what the LLM extracted, builds the search document from it and marks
 * the candidate ready for ranking.
 */
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
      searchVector: searchDocument(profile),
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

/** Hides a candidate from every read; the row and its file stay */
export const softDelete = async (id: string): Promise<boolean> => {
  const rows = await db
    .update(candidatesTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(candidatesTable.id, id), isLive))
    .returning({ id: candidatesTable.id })
  return rows.length > 0
}

/** The job data the shortlist filters and ranks on */
export type ShortlistInput = {
  area: Area
  mustHave: string[]
  niceToHave: string[]
  limit: number
}

/** A shortlisted candidate and its full-text rank */
export type ShortlistEntry = { candidateId: string; rank: number }

/**
 * Stage 1 of the ranking, with no LLM involved: ready candidates from the
 * job's area that match at least one must-have term, best full-text rank
 * first. Nice-to-have terms only raise the rank. A job without must-have
 * terms filters on its nice-to-have terms instead; a job with neither gets an
 * empty shortlist.
 */
export const shortlist = async ({
  area,
  mustHave,
  niceToHave,
  limit,
}: ShortlistInput): Promise<ShortlistEntry[]> => {
  const mustQuery = anyTermQuery(mustHave)
  const niceQuery = anyTermQuery(niceToHave)
  const filterQuery = mustQuery ?? niceQuery
  if (!filterQuery) return []

  const rankQuery =
    mustQuery && niceQuery ? eitherQuery(mustQuery, niceQuery) : filterQuery
  const score = rank(candidatesTable.searchVector, rankQuery)

  return db
    .select({ candidateId: candidatesTable.id, rank: score })
    .from(candidatesTable)
    .where(
      and(
        isLive,
        eq(candidatesTable.status, 'ready'),
        arrayContains(candidatesTable.areas, [area]),
        matches(candidatesTable.searchVector, filterQuery)
      )
    )
    .orderBy(desc(score), candidatesTable.createdAt)
    .limit(limit)
}
