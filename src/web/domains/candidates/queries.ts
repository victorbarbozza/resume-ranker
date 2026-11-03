import { infiniteQueryOptions, useMutation } from '@tanstack/react-query'
import { parseResponse } from 'hono/client'

import type { CandidateStatus } from '@/server/shared/schemas/candidate.schema'
import type { Area } from '@/shared/areas'
import { DELETE_MAX_CANDIDATES } from '@/shared/limits'
import { client } from '@/web/lib/api'
import { pollInterval, queryClient } from '@/web/lib/query-client'

/** What the candidate list is filtered by; the server searches, filters and pages */
export type CandidateFilters = {
  search?: string
  area?: Area
  status?: CandidateStatus
}

/**
 * Candidates matching the filters, 50 a page, newest first, with the next
 * page loaded on request. While a loaded candidate is still being read, the
 * loaded pages are asked again, faster right after it was added.
 */
export const candidatesQuery = (filters: CandidateFilters) =>
  infiniteQueryOptions({
    queryKey: ['candidates', filters],
    queryFn: ({ pageParam }) =>
      parseResponse(
        client.api.candidates.$get({
          query: {
            search: filters.search?.trim() || undefined,
            area: filters.area,
            status: filters.status,
            cursor: pageParam || undefined,
          },
        })
      ),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: (query) => {
      const pendingSince = (query.state.data?.pages ?? [])
        .flatMap((page) => page.candidates)
        .filter((candidate) => candidate.status === 'pending')
        .map((candidate) => candidate.updatedAt)
        .sort()
        .at(-1)
      return pendingSince ? pollInterval(pendingSince) : false
    },
  })

/** Refreshes the candidates read, such as after an upload */
export const refreshCandidates = () =>
  queryClient.invalidateQueries({ queryKey: ['candidates'] })

/** Sends resumes in one request and answers what happened to each, in order */
export const uploadResumes = (files: File[]) =>
  parseResponse(client.api.candidates.$post({ form: { files } }))

/** Queues a resume that could not be read again */
export const useRetryProfile = () =>
  useMutation({
    mutationFn: (candidateId: string) =>
      parseResponse(
        client.api.candidates[':id'].retry.$post({ param: { id: candidateId } })
      ),
    onSuccess: refreshCandidates,
  })

/** Deletes candidates by id, DELETE_MAX_CANDIDATES per request, and answers how many were deleted */
export const useDeleteCandidates = () =>
  useMutation({
    mutationFn: async (candidateIds: string[]) => {
      let deleted = 0
      for (
        let start = 0;
        start < candidateIds.length;
        start += DELETE_MAX_CANDIDATES
      ) {
        const ids = candidateIds.slice(start, start + DELETE_MAX_CANDIDATES)
        const answer = await parseResponse(
          client.api.candidates.delete.$post({ json: { ids } })
        )
        deleted += answer.deleted
      }
      return deleted
    },
    onSuccess: refreshCandidates,
  })

/** Deletes a candidate */
export const useDeleteCandidate = () =>
  useMutation({
    mutationFn: (candidateId: string) =>
      parseResponse(
        client.api.candidates[':id'].$delete({ param: { id: candidateId } })
      ),
    onSuccess: refreshCandidates,
  })
