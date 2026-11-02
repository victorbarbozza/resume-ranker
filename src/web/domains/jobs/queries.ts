import { queryOptions, useMutation } from '@tanstack/react-query'
import { parseResponse } from 'hono/client'

import type { Area } from '@/shared/areas'
import { client } from '@/web/lib/api'
import { pollInterval, queryClient } from '@/web/lib/query-client'

/** What a person fills in for a job */
export type JobInput = { title: string; description: string; area: Area }

/** Every live job, newest first; asked again while any analysis is pending, faster right after it started */
export const jobsQuery = queryOptions({
  queryKey: ['jobs'],
  queryFn: () => parseResponse(client.api.jobs.$get()),
  refetchInterval: (query) => {
    const started = (query.state.data?.jobs ?? [])
      .filter((job) => job.status === 'pending')
      .map((job) => job.updatedAt)
      .sort()
      .at(-1)
    return started ? pollInterval(started) : false
  },
})

/** One job; asked again while its analysis is pending, faster right after it started */
export const jobQuery = (jobId: string) =>
  queryOptions({
    queryKey: ['jobs', jobId],
    queryFn: () =>
      parseResponse(client.api.jobs[':id'].$get({ param: { id: jobId } })),
    refetchInterval: (query) =>
      query.state.data?.status === 'pending'
        ? pollInterval(query.state.data.updatedAt)
        : false,
  })

/** Refreshes every job read: the list and each job */
const refreshJobs = () => queryClient.invalidateQueries({ queryKey: ['jobs'] })

/** Refreshes a job and its ranking, whose banners depend on the job's analysis */
const refreshJob = (jobId: string) =>
  Promise.all([
    refreshJobs(),
    queryClient.invalidateQueries({ queryKey: ['rankings', jobId] }),
  ])

/** Creates a job; its analysis starts in the background */
export const useCreateJob = () =>
  useMutation({
    mutationFn: (input: JobInput) =>
      parseResponse(client.api.jobs.$post({ json: input })),
    onSuccess: refreshJobs,
  })

/** Saves an edit; the job gets a new version, so its results go stale, and it is analysed again */
export const useUpdateJob = () =>
  useMutation({
    mutationFn: ({ jobId, input }: { jobId: string; input: JobInput }) =>
      parseResponse(
        client.api.jobs[':id'].$patch({ param: { id: jobId }, json: input })
      ),
    onSuccess: (_job, { jobId }) => refreshJob(jobId),
  })

/**
 * Deletes a job. Its own reads are dropped instead of refreshed: asking for a
 * deleted job again would only answer 404.
 */
export const useDeleteJob = () =>
  useMutation({
    mutationFn: (jobId: string) =>
      parseResponse(client.api.jobs[':id'].$delete({ param: { id: jobId } })),
    onSuccess: (_answer, jobId) => {
      queryClient.removeQueries({ queryKey: ['jobs', jobId], exact: true })
      queryClient.removeQueries({ queryKey: ['rankings', jobId] })
      return queryClient.invalidateQueries({ queryKey: ['jobs'], exact: true })
    },
  })

/** Queues a failed analysis again */
export const useRetryAnalysis = () =>
  useMutation({
    mutationFn: (jobId: string) =>
      parseResponse(
        client.api.jobs[':id'].retry.$post({ param: { id: jobId } })
      ),
    onSuccess: (_job, jobId) => refreshJob(jobId),
  })
