import { db } from '@/server/shared/connectors/postgres'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as tasksRepo from '@/server/shared/database/repositories/tasks'
import { HTTPError } from '@/server/shared/http/http-error'
import type { ICandidate } from '@/server/shared/schemas/candidate.schema'
import { candidateProfilePrompt } from '@/server/tasks/prompts/candidate-extract-profile'

/** Candidates one page of the list holds */
export const CANDIDATES_PAGE_SIZE = 50

/** The 404 every candidate route answers for a candidate that does not exist or was deleted */
const candidateNotFound = () =>
  new HTTPError('candidate not found', {
    statusCode: 404,
    code: 'CANDIDATE_NOT_FOUND',
  })

/** A candidate of the list; `stale` when its profile was read with an older prompt, so it can be read again */
export type ListedCandidate = ICandidate & { stale: boolean }

/**
 * One page of the candidate list.
 *
 * - `nextCursor`: the id to ask for the next page with; null on the last page
 * - `anyFailed`: whether any resume in the base could not be read, whatever the filters
 */
export type CandidatePage = {
  candidates: ListedCandidate[]
  nextCursor: string | null
  anyFailed: boolean
}

/**
 * Live candidates matching the filters, newest first, one page at a time.
 * One row more than the page is read to know whether another page follows,
 * so nothing is counted.
 */
export const listCandidates = async (
  filters: candidatesRepo.CandidateFilters
): Promise<CandidatePage> => {
  const [rows, anyFailed] = await Promise.all([
    candidatesRepo.listPage(filters, CANDIDATES_PAGE_SIZE + 1),
    candidatesRepo.anyFailed(),
  ])
  const candidates = rows.slice(0, CANDIDATES_PAGE_SIZE).map((candidate) => ({
    ...candidate,
    stale:
      candidate.status === 'ready' &&
      candidate.profileGeneratedBy?.promptVersion !==
        candidateProfilePrompt.version,
  }))
  const last = candidates.at(-1)
  return {
    candidates,
    nextCursor: rows.length > CANDIDATES_PAGE_SIZE && last ? last.id : null,
    anyFailed,
  }
}

/** Hides a candidate; its row and file stay, and the same file can be uploaded again */
export const deleteCandidate = async (id: string): Promise<void> => {
  if (!(await candidatesRepo.softDelete(id))) throw candidateNotFound()
}

/** Hides the candidates among the ids that are still live, and answers how many */
export const deleteCandidates = async (
  ids: string[]
): Promise<{ deleted: number }> => ({
  deleted: await candidatesRepo.softDeleteMany(ids),
})

/**
 * Queues the profile of a candidate again, after it failed or when it was
 * read with an older prompt. Answers 409 while the profile is pending or
 * current, so a candidate never has two profiles queued at once.
 */
export const retryProfile = async (id: string): Promise<ICandidate> =>
  db.transaction(async (tx) => {
    const candidate = await candidatesRepo.reopenProfile(
      id,
      candidateProfilePrompt.version,
      tx
    )
    if (!candidate) {
      if (!(await candidatesRepo.findById(id, tx))) throw candidateNotFound()
      throw new HTTPError(
        'only a failed or outdated profile can be read again',
        {
          statusCode: 409,
          code: 'PROFILE_NOT_RETRYABLE',
        }
      )
    }
    await tasksRepo.enqueue(
      'candidate.extract_profile',
      { candidateId: candidate.id },
      tx
    )
    return candidate
  })
