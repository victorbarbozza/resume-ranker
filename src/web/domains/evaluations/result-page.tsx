import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/web/components/button'
import { ChevronLeftIcon, ChevronRightIcon } from '@/web/components/icons'
import {
  EmptyState,
  Note,
  Page,
  PageHeader,
  Panel,
  Skeleton,
} from '@/web/components/page'
import { Tag } from '@/web/components/status'
import { jobQuery } from '@/web/domains/jobs/queries'
import { describeError } from '@/web/lib/api'
import { areaLabel, displayName } from '@/web/lib/format'

import { AssessmentList } from './assessments'
import styles from './evaluations.module.css'
import { rankingQuery, useRank } from './queries'
import { provenance } from './ranking'

/**
 * One result on its own screen, as a phone opens a ranking row: the score and
 * the summary, then the verdict on each requirement behind it. Previous and Next walk
 * the ranking in order without going back to it. A stale or failed result can
 * be scored again from here.
 */
export function ResultPage({
  jobId,
  candidateId,
}: {
  jobId: string
  candidateId: string
}) {
  const { t } = useTranslation()
  const job = useQuery(jobQuery(jobId))
  const ranking = useQuery(rankingQuery(jobId))
  const rank = useRank(jobId)

  const back = (
    <Link to="/jobs/$jobId" params={{ jobId }} className={styles.back}>
      <ChevronLeftIcon size={20} />
      {t('ranking.back')}
    </Link>
  )
  if (job.isPending || ranking.isPending) {
    return (
      <Page>
        {back}
        <Panel busy>
          <Skeleton label={t('common.loading')} rows={3} />
        </Panel>
      </Page>
    )
  }
  if (!job.data || !ranking.data) {
    return (
      <Page>
        {back}
        <EmptyState
          title={t('ranking.loadFailed')}
          action={
            <Button
              onClick={() => {
                job.refetch()
                ranking.refetch()
              }}
            >
              {t('common.tryAgain')}
            </Button>
          }
        >
          {describeError(job.error ?? ranking.error)}
        </EmptyState>
      </Page>
    )
  }

  const evaluations = ranking.data.evaluations
  const index = evaluations.findIndex(
    (item) => item.candidate.id === candidateId
  )
  const evaluation = evaluations[index]
  if (!evaluation) {
    return (
      <Page>
        {back}
        <EmptyState
          title={t('ranking.resultNotFound')}
          action={
            <Link to="/jobs/$jobId" params={{ jobId }}>
              {t('ranking.back')}
            </Link>
          }
        >
          {t('ranking.resultNotFoundText')}
        </EmptyState>
      </Page>
    )
  }

  const scored = evaluations.filter((item) => item.status === 'done')
  const position = scored.indexOf(evaluation) + 1
  const before = evaluations[index - 1]
  const after = evaluations[index + 1]
  const scoreAgain = () =>
    rank.mutate(
      { scope: 'selected', candidateIds: [candidateId] },
      { onError: (error) => toast.error(describeError(error)) }
    )

  return (
    <Page>
      {back}
      <PageHeader
        title={displayName(evaluation.candidate)}
        subtitle={
          position > 0
            ? t('ranking.rankOf', {
                rank: position,
                total: scored.length,
                job: job.data.title,
              })
            : job.data.title
        }
      />
      <Panel className={styles.resultScore}>
        {evaluation.status === 'done' ? (
          <>
            <p className={styles.big}>
              <span
                className={`${styles.bigNumber} ${evaluation.stale ? styles.dim : ''}`}
              >
                {evaluation.score}
              </span>
              <span className={styles.subtitle}>{t('ranking.ofHundred')}</span>
            </p>
            <span
              className={`${styles.ramp} ${styles.wideRamp} ${evaluation.stale ? styles.dim : ''}`}
              aria-hidden="true"
            >
              <span
                className={styles.rampFill}
                style={{ width: `${evaluation.score ?? 0}%` }}
              />
            </span>
          </>
        ) : null}
        <p className={styles.summary}>
          {evaluation.summary ??
            (evaluation.status === 'queued'
              ? t('ranking.waiting')
              : t('ranking.noAnswer'))}
        </p>
        <div className={styles.resultTags}>
          {evaluation.stale && <Tag tone="stale">{t('common.stale')}</Tag>}
          {evaluation.otherArea && (
            <Tag tone="other">
              {evaluation.candidate.areas[0]
                ? t('common.otherAreaOf', {
                    area: areaLabel(evaluation.candidate.areas[0]),
                  })
                : t('common.otherArea')}
            </Tag>
          )}
          {evaluation.generatedBy?.model === 'fake' && (
            <Tag tone="placeholder">{t('common.placeholder')}</Tag>
          )}
        </div>
        <Note>{provenance(evaluation, job.data)}</Note>
        {(evaluation.stale || evaluation.status === 'failed') && (
          <Button
            variant="tinted"
            fullWidth
            disabled={job.data.status === 'pending'}
            loading={rank.isPending}
            onClick={scoreAgain}
          >
            {t('ranking.scoreAgain')}
          </Button>
        )}
      </Panel>

      {evaluation.assessments.length > 0 && (
        <section className={styles.group} aria-labelledby="criteria">
          <h2 id="criteria" className={styles.label}>
            {t('jobs.requirements')}
          </h2>
          <Panel className={styles.criteriaPanel}>
            <AssessmentList assessments={evaluation.assessments} />
          </Panel>
        </section>
      )}

      {(before || after) && (
        <nav className={styles.stepper} aria-label={t('ranking.otherResults')}>
          {before ? (
            <Link
              to="/jobs/$jobId/results/$candidateId"
              params={{ jobId, candidateId: before.candidate.id }}
              replace
              className={styles.step}
            >
              <span className={styles.stepLabel}>
                <ChevronLeftIcon size={14} />
                {t('ranking.previous')}
              </span>
              <span className={styles.stepName}>
                {displayName(before.candidate)}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {after && (
            <Link
              to="/jobs/$jobId/results/$candidateId"
              params={{ jobId, candidateId: after.candidate.id }}
              replace
              className={`${styles.step} ${styles.stepNext}`}
            >
              <span className={styles.stepLabel}>
                {t('ranking.next')}
                <ChevronRightIcon size={14} />
              </span>
              <span className={styles.stepName}>
                {displayName(after.candidate)}
              </span>
            </Link>
          )}
        </nav>
      )}
    </Page>
  )
}
