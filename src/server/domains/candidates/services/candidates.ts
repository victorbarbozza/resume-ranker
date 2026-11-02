import { db } from '@/server/shared/connectors/postgres'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as tasksRepo from '@/server/shared/database/repositories/tasks'
import { HTTPError } from '@/server/shared/http/http-error'
import type { ICandidate } from '@/server/shared/schemas/candidate.schema'

/** The 404 every candidate route answers for a candidate that does not exist or was deleted */
const candidateNotFound = () =>
  new HTTPError('candidate not found', {
    statusCode: 404,
    code: 'CANDIDATE_NOT_FOUND',
  })

/** Every live candidate with its status, newest first */
export const listCandidates = async (): Promise<ICandidate[]> =>
  candidatesRepo.list()

/** Hides a candidate; its row and file stay, and the same file can be uploaded again */
export const deleteCandidate = async (id: string): Promise<void> => {
  if (!(await candidatesRepo.softDelete(id))) throw candidateNotFound()
}

/**
 * Queues the profile of a candidate again after it failed. Answers 409 while
 * the profile is pending or done, so a candidate never has two profiles
 * queued at once.
 */
export const retryProfile = async (id: string): Promise<ICandidate> =>
  db.transaction(async (tx) => {
    const candidate = await candidatesRepo.reopenFailedProfile(id, tx)
    if (!candidate) {
      if (!(await candidatesRepo.findById(id, tx))) throw candidateNotFound()
      throw new HTTPError('only a failed profile can be retried', {
        statusCode: 409,
        code: 'PROFILE_NOT_FAILED',
      })
    }
    await tasksRepo.enqueue(
      'candidate.extract_profile',
      { candidateId: candidate.id },
      tx
    )
    return candidate
  })
