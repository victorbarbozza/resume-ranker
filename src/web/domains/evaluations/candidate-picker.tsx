import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { ICandidate } from '@/server/shared/schemas/candidate.schema'
import type { IJob } from '@/server/shared/schemas/job.schema'
import { DEFAULT_RANKING_MAX_CANDIDATES } from '@/shared/limits'
import { Button } from '@/web/components/button'
import { SearchField, Segmented } from '@/web/components/controls'
import { EmptyState } from '@/web/components/page'
import { Sheet } from '@/web/components/sheet'
import { Tag } from '@/web/components/status'
import { candidatesQuery } from '@/web/domains/candidates/queries'
import { describeError } from '@/web/lib/api'
import { areaLabel, displayName, profileLine } from '@/web/lib/format'

import styles from './evaluations.module.css'
import { rankingQuery, useRank } from './queries'

/**
 * Picks candidates by hand to rank against a job, from the ready ones: the
 * job's area first, then the other areas. Someone from another area is scored
 * all the same and marked Other area. A candidate already scored shows the
 * score, or Stale when it needs an update. The choice is forgotten when the
 * sheet closes.
 */
export function CandidatePicker({
  job,
  open,
  onClose,
}: {
  job: IJob
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { data } = useQuery(candidatesQuery)
  const { data: ranking } = useQuery(rankingQuery(job.id))
  const rank = useRank(job.id)
  const [picked, setPicked] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<'job' | 'all'>('all')

  const close = () => {
    setPicked([])
    setSearch('')
    setScope('all')
    onClose()
  }
  const ready = (data?.candidates ?? []).filter(
    (candidate) => candidate.status === 'ready'
  )
  const term = search.trim().toLowerCase()
  const shown = ready.filter(
    (candidate) =>
      (scope === 'all' || candidate.areas.includes(job.area)) &&
      [displayName(candidate), ...(candidate.profile?.skills ?? [])].some(
        (text) => text.toLowerCase().includes(term)
      )
  )
  const groups = [
    {
      title: areaLabel(job.area),
      people: shown.filter((candidate) => candidate.areas.includes(job.area)),
    },
    {
      title: t('ranking.otherAreas'),
      people: shown.filter((candidate) => !candidate.areas.includes(job.area)),
    },
  ].filter((group) => group.people.length > 0)
  const full = picked.length >= DEFAULT_RANKING_MAX_CANDIDATES
  const toggle = (candidateId: string) =>
    setPicked(
      picked.includes(candidateId)
        ? picked.filter((id) => id !== candidateId)
        : [...picked, candidateId]
    )
  const rankPicked = () =>
    rank.mutate(
      { scope: 'selected', candidateIds: picked },
      {
        onSuccess: close,
        onError: (error) => toast.error(describeError(error)),
      }
    )

  /** What the ranking already holds for a candidate: the score, Stale, or that the model did not answer */
  const previous = (candidate: ICandidate) => {
    const evaluation = ranking?.evaluations.find(
      (item) => item.candidate.id === candidate.id
    )
    if (!evaluation || evaluation.status === 'queued') return null
    if (evaluation.stale) return <Tag tone="stale">{t('common.stale')}</Tag>
    if (evaluation.status === 'failed') {
      return <span className={styles.previous}>{t('ranking.unscored')}</span>
    }
    return (
      <span className={styles.previous}>
        {t('ranking.scoredBefore', { score: evaluation.score })}
      </span>
    )
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      size="wide"
      title={t('ranking.pickTitle')}
      description={t('ranking.pickDescription')}
      footer={
        <>
          <span className={styles.pickCount} aria-live="polite">
            <b>{t('ranking.selected', { count: picked.length })}</b>
            {', '}
            {full ? (
              <span className={styles.limitReached}>
                {t('ranking.limitReached', {
                  max: DEFAULT_RANKING_MAX_CANDIDATES,
                })}
              </span>
            ) : (
              t('ranking.limit', { max: DEFAULT_RANKING_MAX_CANDIDATES })
            )}
          </span>
          <Button
            variant="primary"
            disabled={picked.length === 0}
            loading={rank.isPending}
            onClick={rankPicked}
          >
            {t('ranking.rank', { count: picked.length })}
          </Button>
        </>
      }
    >
      <div className={styles.picker}>
        <div className={styles.pickFilters}>
          <SearchField
            label={t('ranking.pickSearch')}
            placeholder={t('ranking.pickSearchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Segmented<'job' | 'all'>
            label={t('ranking.pickScope')}
            value={scope}
            onChange={setScope}
            segments={[
              { value: 'job', label: areaLabel(job.area) },
              { value: 'all', label: t('common.allAreas') },
            ]}
          />
        </div>
        {ready.length === 0 && <EmptyState title={t('ranking.noneReady')} />}
        {ready.length > 0 && groups.length === 0 && (
          <EmptyState
            title={
              term
                ? t('ranking.noneMatch', { search: search.trim() })
                : t('ranking.emptyNone', { area: areaLabel(job.area) })
            }
          />
        )}
        {groups.map((group) => (
          <section key={group.title} className={styles.pickGroup}>
            <h3 className={styles.pickGroupTitle}>{group.title}</h3>
            <ul>
              {group.people.map((candidate) => {
                const checked = picked.includes(candidate.id)
                const otherArea = !candidate.areas.includes(job.area)
                return (
                  <li key={candidate.id}>
                    <label className={styles.person}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && full}
                        onChange={() => toggle(candidate.id)}
                      />
                      <span className={styles.personText}>
                        <span className={styles.name}>
                          {displayName(candidate)}
                        </span>
                        <span className={styles.personLine}>
                          {[
                            profileLine(candidate.profile),
                            candidate.profile?.skills.slice(0, 4).join(', '),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className={styles.personTags}>
                        {previous(candidate)}
                        {otherArea && (
                          <Tag tone="other">
                            {candidate.areas[0]
                              ? t('common.otherAreaOf', {
                                  area: areaLabel(candidate.areas[0]),
                                })
                              : t('common.otherArea')}
                          </Tag>
                        )}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  )
}
