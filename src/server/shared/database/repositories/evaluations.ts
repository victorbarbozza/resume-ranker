import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'

import { db, type Executor } from '@/server/shared/connectors/postgres'
import {
  candidates as candidatesTable,
  evaluations as evaluationsTable,
} from '@/server/shared/database/schema'
import type {
  IAssessment,
  IEvaluation,
} from '@/server/shared/schemas/evaluation.schema'
import type { IGeneratedBy } from '@/server/shared/schemas/generated-by.schema'
import type { Area } from '@/shared/areas'

/** An evaluations row as Drizzle returns it */
type EvaluationRow = typeof evaluationsTable.$inferSelect

/** Maps a row to the evaluation the rest of the server sees */
const toEvaluation = (row: EvaluationRow): IEvaluation => ({
  jobId: row.jobId,
  candidateId: row.candidateId,
  jobVersion: row.jobVersion,
  status: row.status,
  score: row.score,
  summary: row.summary,
  assessments: row.assessments,
  generatedBy:
    row.model && row.promptVersion
      ? { model: row.model, promptVersion: row.promptVersion }
      : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

/** Queues candidates for one job version, replacing any earlier result */
export const queue = async (
  jobId: string,
  jobVersion: number,
  candidateIds: string[],
  executor: Executor = db
): Promise<void> => {
  if (candidateIds.length === 0) return

  await executor
    .insert(evaluationsTable)
    .values(
      candidateIds.map((candidateId) => ({ jobId, candidateId, jobVersion }))
    )
    .onConflictDoUpdate({
      target: [evaluationsTable.jobId, evaluationsTable.candidateId],
      set: {
        jobVersion,
        status: 'queued',
        score: null,
        summary: null,
        assessments: [],
        model: null,
        promptVersion: null,
        updatedAt: new Date(),
      },
    })
}

/** The result of one candidate: the verdicts, the score computed from them and the LLM's summary */
export type EvaluationResult = {
  score: number
  summary: string | null
  assessments: IAssessment[]
}

/**
 * Saves the result of one candidate for one job version. Returns false when
 * that version is no longer the one queued for the candidate.
 */
export const saveResult = async (
  jobId: string,
  jobVersion: number,
  candidateId: string,
  generatedBy: IGeneratedBy,
  result: EvaluationResult
): Promise<boolean> => {
  const rows = await db
    .update(evaluationsTable)
    .set({
      ...result,
      model: generatedBy.model,
      promptVersion: generatedBy.promptVersion,
      status: 'done',
    })
    .where(
      and(
        eq(evaluationsTable.jobId, jobId),
        eq(evaluationsTable.candidateId, candidateId),
        eq(evaluationsTable.jobVersion, jobVersion)
      )
    )
    .returning({ candidateId: evaluationsTable.candidateId })
  return rows.length > 0
}

/** Marks the still-queued evaluations of a batch as failed */
export const markFailed = async (
  jobId: string,
  jobVersion: number,
  candidateIds: string[]
): Promise<void> => {
  if (candidateIds.length === 0) return

  await db
    .update(evaluationsTable)
    .set({ status: 'failed' })
    .where(
      and(
        eq(evaluationsTable.jobId, jobId),
        eq(evaluationsTable.jobVersion, jobVersion),
        eq(evaluationsTable.status, 'queued'),
        inArray(evaluationsTable.candidateId, candidateIds)
      )
    )
}

/** Every evaluation of a job, best score first and unscored ones last */
export const listByJob = async (jobId: string): Promise<IEvaluation[]> => {
  const rows = await db
    .select()
    .from(evaluationsTable)
    .where(eq(evaluationsTable.jobId, jobId))
    .orderBy(
      sql`${evaluationsTable.score} desc nulls last`,
      evaluationsTable.createdAt
    )
  return rows.map(toEvaluation)
}

/**
 * Candidates of a job that already have a current result, so a ranking does
 * not send them to the LLM again: queued for this job version, or done for it
 * by the current prompt version.
 */
export const listCurrentCandidateIds = async (
  jobId: string,
  jobVersion: number,
  promptVersion: string
): Promise<string[]> => {
  const rows = await db
    .select({ candidateId: evaluationsTable.candidateId })
    .from(evaluationsTable)
    .where(
      and(
        eq(evaluationsTable.jobId, jobId),
        eq(evaluationsTable.jobVersion, jobVersion),
        or(
          eq(evaluationsTable.status, 'queued'),
          and(
            eq(evaluationsTable.status, 'done'),
            eq(evaluationsTable.promptVersion, promptVersion)
          )
        )
      )
    )
  return rows.map((row) => row.candidateId)
}

/** An evaluation with the candidate it scores, as the ranking table shows it */
export type EvaluationWithCandidate = IEvaluation & {
  candidate: {
    id: string
    name: string | null
    fileName: string
    areas: Area[]
  }
}

/** Every evaluation of a job with its live candidate, best score first and unscored ones last */
export const listByJobWithCandidates = async (
  jobId: string
): Promise<EvaluationWithCandidate[]> => {
  const rows = await db
    .select({
      evaluation: evaluationsTable,
      candidate: {
        id: candidatesTable.id,
        name: candidatesTable.name,
        fileName: candidatesTable.fileName,
        areas: candidatesTable.areas,
      },
    })
    .from(evaluationsTable)
    .innerJoin(
      candidatesTable,
      eq(candidatesTable.id, evaluationsTable.candidateId)
    )
    .where(
      and(eq(evaluationsTable.jobId, jobId), isNull(candidatesTable.deletedAt))
    )
    .orderBy(
      sql`${evaluationsTable.score} desc nulls last`,
      evaluationsTable.createdAt
    )
  return rows.map(({ evaluation, candidate }) => ({
    ...toEvaluation(evaluation),
    candidate,
  }))
}
