import { queryOptions, useMutation } from '@tanstack/react-query'
import { parseResponse } from 'hono/client'
import { toast } from 'sonner'

import type { RankSummary } from '@/server/domains/evaluations/services/rankings'
import { i18n } from '@/web/i18n'
import { client } from '@/web/lib/api'
import { pollInterval, queryClient } from '@/web/lib/query-client'

/** Which candidates a ranking scores: every ready one of the job's area, or the ones picked by hand */
export type RankRequest =
  { scope: 'area' } | { scope: 'selected'; candidateIds: string[] }

/** The ranking of a job; asked again while any batch is still queued, faster right after it was queued */
export const rankingQuery = (jobId: string) =>
  queryOptions({
    queryKey: ['rankings', jobId],
    queryFn: () =>
      parseResponse(
        client.api.jobs[':id'].evaluations.$get({ param: { id: jobId } })
      ),
    refetchInterval: (query) => {
      const queuedAt = (query.state.data?.evaluations ?? [])
        .filter((evaluation) => evaluation.status === 'queued')
        .map((evaluation) => evaluation.updatedAt)
        .sort()
        .at(-1)
      return queuedAt ? pollInterval(queuedAt) : false
    },
  })

/** Says what a ranking queued, and what it left as it was */
const announceRanking = (summary: RankSummary) => {
  if (summary.queued === 0) {
    toast.success(i18n.t('ranking.nothingQueued'))
    return
  }
  const notes = [
    summary.alreadyCurrent > 0 &&
      i18n.t('ranking.alreadyCurrent', { count: summary.alreadyCurrent }),
    summary.leftOut > 0 &&
      i18n.t('ranking.leftOut', { count: summary.leftOut }),
    summary.skipped.length > 0 &&
      i18n.t('ranking.skipped', { count: summary.skipped.length }),
  ].filter(Boolean)
  toast.success(i18n.t('ranking.queued', { count: summary.queued }), {
    description: notes.join(' · ') || undefined,
  })
}

/** Queues a ranking, says what it queued, and refreshes the ranking */
export const useRank = (jobId: string) =>
  useMutation({
    mutationFn: (request: RankRequest) =>
      parseResponse(
        client.api.jobs[':id'].evaluations.$post({
          param: { id: jobId },
          json: request,
        })
      ),
    onSuccess: (summary) => {
      announceRanking(summary)
      return queryClient.invalidateQueries({ queryKey: ['rankings', jobId] })
    },
  })
