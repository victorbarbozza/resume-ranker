import { queryOptions, useMutation } from '@tanstack/react-query'
import { parseResponse } from 'hono/client'

import { client } from '@/web/lib/api'
import { pollInterval, queryClient } from '@/web/lib/query-client'

/** Every live candidate; asked again while any resume is still being read, faster right after it was added */
export const candidatesQuery = queryOptions({
  queryKey: ['candidates'],
  queryFn: () => parseResponse(client.api.candidates.$get({ query: {} })),
  refetchInterval: (query) => {
    const pendingSince = (query.state.data?.candidates ?? [])
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

/** Deletes a candidate */
export const useDeleteCandidate = () =>
  useMutation({
    mutationFn: (candidateId: string) =>
      parseResponse(
        client.api.candidates[':id'].$delete({ param: { id: candidateId } })
      ),
    onSuccess: refreshCandidates,
  })
