import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { RankedEvaluation } from '@/server/domains/evaluations/services/rankings'
import type { IJob } from '@/server/shared/schemas/job.schema'
import { DEFAULT_RANKING_MAX_CANDIDATES } from '@/shared/limits'
import { Button } from '@/web/components/button'
import { Banner, ProgressBar } from '@/web/components/controls'
import {
  ChevronRightIcon,
  CrossCircleIcon,
  MinusIcon,
  PlusIcon,
  SpinnerIcon,
} from '@/web/components/icons'
import {
  EmptyState,
  Note,
  Panel,
  SectionTitle,
  Skeleton,
} from '@/web/components/page'
import { Tag } from '@/web/components/status'
import { i18n } from '@/web/i18n'
import { describeError } from '@/web/lib/api'
import { areaLabel, displayName } from '@/web/lib/format'
import { PHONE_QUERY, useMediaQuery } from '@/web/lib/use-media-query'

import {
  AssessmentList,
  criterionLabel,
  gapsOf,
  strengthsOf,
} from './assessments'
import { CandidatePicker } from './candidate-picker'
import styles from './evaluations.module.css'
import { rankingQuery, useRank } from './queries'

/** Whether a job has anything to rank against: a requirement, or the experience it asks for */
export const hasCriteria = (job: IJob) =>
  job.requirements !== null &&
  (job.requirements.mustHave.length > 0 ||
    job.requirements.niceToHave.length > 0 ||
    job.requirements.experience.minYears !== null ||
    job.requirements.experience.seniority !== null)

/** Who and what produced a result, or why it needs an update */
export const provenance = (evaluation: RankedEvaluation, job: IJob) => {
  if (evaluation.jobVersion < job.version) {
    return i18n.t('ranking.madeForVersion', {
      old: evaluation.jobVersion,
      current: job.version,
    })
  }
  if (evaluation.stale) return i18n.t('ranking.olderPrompt')
  if (!evaluation.generatedBy) return ''
  return i18n.t('ranking.provenance', {
    model: evaluation.generatedBy.model,
    prompt: evaluation.generatedBy.promptVersion,
    version: evaluation.jobVersion,
  })
}

/**
 * The ranking of a job, best score first. The main button asks the server to
 * score the ready candidates of the job's area that have no current result,
 * and the server answers how many it queued, so the screen never loads or
 * counts the whole base; picking scores
 * the ones chosen by hand, from any area. Results that went stale or failed,
 * whatever their area, are updated from the banner above the list. The list
 * asks again while batches are queued. A row opens in place on a computer and
 * as its own screen on a phone.
 */
export function Ranking({ job }: { job: IJob }) {
  const { t } = useTranslation()
  const ranking = useQuery(rankingQuery(job.id))
  const rank = useRank(job.id)
  const phone = useMediaQuery(PHONE_QUERY)
  const navigate = useNavigate()
  const [picking, setPicking] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const area = areaLabel(job.area)
  const evaluations = ranking.data?.evaluations ?? []
  const { queued, done, failed } = ranking.data?.progress ?? {
    queued: 0,
    done: 0,
    failed: 0,
  }
  const total = queued + done + failed
  const outdated = evaluations
    .filter((evaluation) => evaluation.stale || evaluation.status === 'failed')
    .map((evaluation) => evaluation.candidate.id)
  const analysing = job.status === 'pending'
  const rankable = hasCriteria(job)
  const scored = evaluations.filter(
    (evaluation) => evaluation.status === 'done'
  )

  const onError = (error: unknown) => toast.error(describeError(error))
  const rankArea = () => rank.mutate({ scope: 'area' }, { onError })
  const updateOutdated = () =>
    rank.mutate(
      {
        scope: 'selected',
        candidateIds: outdated.slice(0, DEFAULT_RANKING_MAX_CANDIDATES),
      },
      { onError }
    )
  const openRow = (candidateId: string) => {
    if (phone) {
      navigate({
        to: '/jobs/$jobId/results/$candidateId',
        params: { jobId: job.id, candidateId },
      })
      return
    }
    setOpenId(openId === candidateId ? null : candidateId)
  }

  const subtitle = analysing
    ? t('ranking.waitingRequirements')
    : !rankable
      ? t('ranking.noRequirements')
      : phone
        ? t('ranking.subtitlePhone')
        : t('ranking.subtitle')

  return (
    <section className={styles.section} aria-labelledby="ranking">
      <div className={styles.head}>
        <div className={styles.titles}>
          <SectionTitle id="ranking">{t('ranking.title')}</SectionTitle>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        <div className={styles.actions}>
          <Button
            disabled={analysing || !rankable}
            onClick={() => setPicking(true)}
          >
            {t('ranking.pick')}
          </Button>
          <Button
            variant="primary"
            disabled={analysing || !rankable}
            loading={rank.isPending && rank.variables?.scope === 'area'}
            onClick={rankArea}
          >
            {t('ranking.rankArea', { area })}
          </Button>
        </div>
      </div>

      {total > 0 && (
        <div className={styles.progress}>
          {queued > 0 && (
            <ProgressBar
              label={t('ranking.progress')}
              valueText={t('ranking.progressText', { done, total })}
              total={total}
              parts={[
                { amount: done, color: 'var(--meter)' },
                { amount: queued, color: 'var(--faint)' },
                { amount: failed, color: 'var(--danger-dot)' },
              ]}
            />
          )}
          <p className={styles.counts} aria-live="polite">
            <span>{t('ranking.scored', { count: done })}</span>
            {queued > 0 && (
              <span>{t('ranking.scoring', { count: queued })}</span>
            )}
            {failed > 0 && (
              <span>{t('ranking.notScored', { count: failed })}</span>
            )}
          </p>
        </div>
      )}

      {outdated.length > 0 && (
        <Banner
          tone="warning"
          action={
            <Button
              size="small"
              variant="tinted"
              disabled={analysing || !rankable}
              loading={rank.isPending && rank.variables?.scope === 'selected'}
              onClick={updateOutdated}
            >
              {t('ranking.update', { count: outdated.length })}
            </Button>
          }
        >
          {t('ranking.outdated', { count: outdated.length })}
        </Banner>
      )}

      <Panel busy={ranking.isPending}>
        {ranking.isPending ? (
          <Skeleton label={t('common.loading')} rows={3} />
        ) : ranking.isError ? (
          <EmptyState
            title={t('ranking.loadFailed')}
            action={
              <Button onClick={() => ranking.refetch()}>
                {t('common.tryAgain')}
              </Button>
            }
          >
            {describeError(ranking.error)}
          </EmptyState>
        ) : total === 0 ? (
          <EmptyState
            title={t('ranking.empty')}
            action={<Link to="/candidates">{t('ranking.uploadResumes')}</Link>}
          >
            {t('ranking.emptyText', { area })}
          </EmptyState>
        ) : (
          <>
            <div className={styles.columns} aria-hidden="true">
              <span>{t('ranking.columnRank')}</span>
              <span>{t('ranking.columnCandidate')}</span>
              <span>{t('ranking.columnScore')}</span>
              <span>{t('ranking.columnWhy')}</span>
              <span>{t('ranking.columnNotes')}</span>
              <span />
            </div>
            <ul>
              {evaluations.map((evaluation) => {
                const id = evaluation.candidate.id
                const open = openId === id
                const position = scored.indexOf(evaluation) + 1
                return (
                  <li key={id} className={styles.item}>
                    <button
                      type="button"
                      className={styles.row}
                      aria-expanded={phone ? undefined : open}
                      aria-controls={phone ? undefined : `result-${id}`}
                      onClick={() => openRow(id)}
                    >
                      <span className={styles.rank}>
                        {position > 0 && (
                          <>
                            <span className="visually-hidden">
                              {t('ranking.srRank', { rank: position })}
                            </span>
                            <span aria-hidden="true">{position}</span>
                          </>
                        )}
                      </span>
                      <span className={styles.who}>
                        <span className={styles.name}>
                          {displayName(evaluation.candidate)}
                        </span>
                        {evaluation.candidate.name && (
                          <span className={styles.file}>
                            {evaluation.candidate.fileName}
                          </span>
                        )}
                      </span>
                      <ScoreCell evaluation={evaluation} />
                      <Why evaluation={evaluation} />
                      <span className={styles.flags}>
                        {evaluation.stale && (
                          <Tag tone="stale">{t('common.stale')}</Tag>
                        )}
                        {evaluation.otherArea && (
                          <Tag tone="other">
                            {evaluation.candidate.areas[0]
                              ? t('common.otherAreaOf', {
                                  area: areaLabel(
                                    evaluation.candidate.areas[0]
                                  ),
                                })
                              : t('common.otherArea')}
                          </Tag>
                        )}
                        {evaluation.generatedBy?.model === 'fake' && (
                          <Tag tone="placeholder">
                            {t('common.placeholder')}
                          </Tag>
                        )}
                      </span>
                      <ChevronRightIcon size={16} className={styles.chevron} />
                    </button>
                    {!phone && (
                      <div
                        id={`result-${id}`}
                        className={styles.disclosure}
                        data-open={open}
                        inert={!open}
                      >
                        <div className={styles.disclosureInner}>
                          <ResultDetail evaluation={evaluation} job={job} />
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Panel>

      <CandidatePicker
        job={job}
        open={picking}
        onClose={() => setPicking(false)}
      />
    </section>
  )
}

/** The score as a number over a bar on a fixed 0 to 100 scale, or where the scoring stands */
function ScoreCell({ evaluation }: { evaluation: RankedEvaluation }) {
  const { t } = useTranslation()
  if (evaluation.status === 'queued') {
    return (
      <span className={styles.score}>
        <span className={styles.waiting}>
          <SpinnerIcon size={14} />
          {t('common.reading')}
        </span>
      </span>
    )
  }
  if (evaluation.status === 'failed') {
    return (
      <span className={styles.score}>
        <span className={styles.failed}>
          <CrossCircleIcon size={14} />
          {t('ranking.unscored')}
        </span>
      </span>
    )
  }
  const dim = evaluation.stale ? styles.dim : ''
  return (
    <span className={styles.score}>
      <span className="visually-hidden">
        {t('ranking.srScore', { score: evaluation.score ?? 0 })}
      </span>
      <span className={`${styles.number} ${dim}`} aria-hidden="true">
        {evaluation.score}
      </span>
      <span className={`${styles.ramp} ${dim}`} aria-hidden="true">
        <span
          className={styles.rampFill}
          style={{ width: `${evaluation.score ?? 0}%` }}
        />
      </span>
    </span>
  )
}

/** The top strength and the top gap, so the reason to call or not shows without opening the row */
function Why({ evaluation }: { evaluation: RankedEvaluation }) {
  const { t } = useTranslation()
  if (evaluation.status === 'queued') {
    return <span className={styles.why}>{t('ranking.waiting')}</span>
  }
  if (evaluation.status === 'failed') {
    return <span className={styles.why}>{t('ranking.noAnswer')}</span>
  }
  const [strength] = strengthsOf(evaluation.assessments)
  const [gap] = gapsOf(evaluation.assessments)
  if (!strength && !gap) {
    return (
      <span className={styles.why}>
        <span className={styles.whySummary}>{evaluation.summary}</span>
      </span>
    )
  }
  return (
    <span className={styles.why}>
      {strength && (
        <span className={`${styles.reason} ${styles.strength}`}>
          <PlusIcon size={14} />
          <span className="visually-hidden">{t('ranking.srStrength')}</span>
          <span className={styles.reasonText}>{criterionLabel(strength)}</span>
        </span>
      )}
      {gap && (
        <span className={`${styles.reason} ${styles.gap}`}>
          <MinusIcon size={14} />
          <span className="visually-hidden">{t('ranking.srGap')}</span>
          <span className={styles.reasonText}>{criterionLabel(gap)}</span>
        </span>
      )}
    </span>
  )
}

/** The summary and the verdict on each requirement behind one score, as a row shows them when opened */
function ResultDetail({
  evaluation,
  job,
}: {
  evaluation: RankedEvaluation
  job: IJob
}) {
  const { t } = useTranslation()
  return (
    <div className={styles.detail}>
      <div className={`${styles.detailColumn} ${styles.detailWide}`}>
        <h4 className={styles.label}>{t('ranking.summary')}</h4>
        <p className={styles.summary}>
          {evaluation.summary ??
            (evaluation.status === 'queued'
              ? t('ranking.waiting')
              : t('ranking.noAnswer'))}
        </p>
        <Note>{provenance(evaluation, job)}</Note>
      </div>
      {evaluation.assessments.length > 0 && (
        <div className={`${styles.detailColumn} ${styles.detailWide}`}>
          <AssessmentList assessments={evaluation.assessments} />
        </div>
      )}
    </div>
  )
}
