import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { IJob } from '@/server/shared/schemas/job.schema'
import { Button } from '@/web/components/button'
import { Banner } from '@/web/components/controls'
import {
  CheckCircleIcon,
  ChevronLeftIcon,
  PlusCircleIcon,
} from '@/web/components/icons'
import {
  EmptyState,
  Note,
  Page,
  PageHeader,
  Panel,
  SectionTitle,
  Skeleton,
} from '@/web/components/page'
import { ConfirmSheet } from '@/web/components/sheet'
import { StatusLabel, Tag } from '@/web/components/status'
import { rankingQuery } from '@/web/domains/evaluations/queries'
import { Ranking } from '@/web/domains/evaluations/ranking'
import { describeError, toApiFailure } from '@/web/lib/api'
import { areaLabel, timeAgo } from '@/web/lib/format'

import { JobForm } from './job-form'
import styles from './job-page.module.css'
import { jobQuery, useDeleteJob, useRetryAnalysis } from './queries'

/**
 * One job: the ranking first, since deciding whom to call is the task, then
 * what the job requires, as the model read it. Once a ranking exists the
 * requirements fold into one line. While the description is being read, the
 * page says so and asks again. A failed analysis can be retried, and the job
 * can still be ranked against its raw description.
 */
export function JobPage({ jobId }: { jobId: string }) {
  const { t } = useTranslation()
  const { data: job, isPending, error, refetch } = useQuery(jobQuery(jobId))
  const remove = useDeleteJob()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (isPending) {
    return (
      <Page>
        <BackToJobs />
        <Panel busy>
          <Skeleton label={t('common.loading')} rows={4} />
        </Panel>
      </Page>
    )
  }
  if (!job) {
    const missing = toApiFailure(error).status === 404
    return (
      <Page>
        <BackToJobs />
        <EmptyState
          title={missing ? t('jobs.notFound') : t('jobs.loadJobFailed')}
          action={
            missing ? (
              <Link to="/jobs">{t('jobs.backToJobs')}</Link>
            ) : (
              <Button onClick={() => refetch()}>{t('common.tryAgain')}</Button>
            )
          }
        >
          {missing ? t('jobs.notFoundText') : describeError(error)}
        </EmptyState>
      </Page>
    )
  }

  const deleteJob = () =>
    remove.mutate(job.id, {
      onSuccess: () => {
        toast.success(t('jobs.deleted'))
        navigate({ to: '/jobs' })
      },
    })

  return (
    <>
      <Page>
        <BackToJobs />
        <PageHeader
          title={job.title}
          subtitle={
            <span className={styles.meta}>
              <Tag tone="neutral">{areaLabel(job.area)}</Tag>
              <span>{t('jobs.version', { version: job.version })}</span>
              {job.status === 'ready' && (
                <StatusLabel tone="ready">
                  {t('jobs.requirementsReady')}
                </StatusLabel>
              )}
              {job.status === 'pending' && (
                <StatusLabel tone="pending">
                  {t('jobs.readingDescription')}
                </StatusLabel>
              )}
              {job.status === 'failed' && (
                <StatusLabel tone="failed">
                  {t('jobs.analysisFailed')}
                </StatusLabel>
              )}
              <span>
                {t('common.updated', { when: timeAgo(job.updatedAt) })}
              </span>
            </span>
          }
          actions={
            <Button onClick={() => setEditing(true)}>{t('common.edit')}</Button>
          }
        />

        <Ranking job={job} />
        <Requirements job={job} />
      </Page>

      <JobForm
        open={editing}
        onClose={() => setEditing(false)}
        job={job}
        onDelete={() => {
          setEditing(false)
          setConfirmingDelete(true)
        }}
      />
      <ConfirmSheet
        open={confirmingDelete}
        onClose={() => {
          setConfirmingDelete(false)
          remove.reset()
        }}
        title={t('jobs.deleteTitle', { title: job.title })}
        description={t('jobs.deleteText')}
        confirmLabel={t('jobs.deleteConfirm')}
        onConfirm={deleteJob}
        pending={remove.isPending}
        error={remove.error ? describeError(remove.error) : undefined}
      />
    </>
  )
}

/** The way back to the list, above the title */
function BackToJobs() {
  const { t } = useTranslation()
  return (
    <Link to="/jobs" className={styles.back}>
      <ChevronLeftIcon size={18} />
      {t('jobs.back')}
    </Link>
  )
}

/**
 * What the job requires. Open while there is no ranking yet; once there is
 * one, it folds into a line with the counts, so the ranking stays in view.
 * The description the model read can be opened inside.
 */
function Requirements({ job }: { job: IJob }) {
  const { t } = useTranslation()
  const retry = useRetryAnalysis()
  const { data: ranking } = useQuery(rankingQuery(job.id))
  const ranked = (ranking?.evaluations.length ?? 0) > 0
  const [expanded, setExpanded] = useState<boolean | null>(null)
  const [showDescription, setShowDescription] = useState(false)
  const open = expanded ?? !ranked

  const retryAnalysis = () =>
    retry.mutate(job.id, {
      onSuccess: () => toast.success(t('jobs.retried')),
      onError: (error) => toast.error(describeError(error)),
    })

  return (
    <section className={styles.section} aria-labelledby="requirements">
      <div className={styles.sectionHead}>
        <SectionTitle id="requirements">{t('jobs.requirements')}</SectionTitle>
        {job.requirements && (
          <span className={styles.summary}>
            {t('jobs.mustCount', { count: job.requirements.mustHave.length })}
            {' · '}
            {t('jobs.niceCount', { count: job.requirements.niceToHave.length })}
          </span>
        )}
        <Button
          variant="plain"
          size="small"
          aria-expanded={open}
          aria-controls="requirements-panel"
          onClick={() => setExpanded(!open)}
        >
          {open ? t('jobs.hideRequirements') : t('jobs.showRequirements')}
        </Button>
      </div>
      {job.status === 'failed' && (
        <Banner
          tone="warning"
          action={
            <Button
              size="small"
              variant="tinted"
              loading={retry.isPending}
              onClick={retryAnalysis}
            >
              {t('common.tryAgain')}
            </Button>
          }
        >
          {t('jobs.failedBanner')}
        </Banner>
      )}
      <div
        id="requirements-panel"
        className={styles.disclosure}
        data-open={open}
        inert={!open}
      >
        <div className={styles.disclosureInner}>
          <Panel className={styles.requirements}>
            {job.status === 'pending' && (
              <EmptyState title={t('jobs.readingDescription')}>
                {t('jobs.readingText')}
              </EmptyState>
            )}
            {job.requirements && (
              <div className={styles.columns}>
                <div className={styles.column}>
                  <h3 className={styles.columnTitle}>{t('jobs.mustHave')}</h3>
                  <ul className={styles.list}>
                    {job.requirements.mustHave.length === 0 && (
                      <li className={styles.none}>{t('common.noneListed')}</li>
                    )}
                    {job.requirements.mustHave.map((requirement) => (
                      <li key={requirement} className={styles.requirement}>
                        <CheckCircleIcon size={18} />
                        {requirement}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={styles.column}>
                  <h3 className={styles.columnTitle}>{t('jobs.niceToHave')}</h3>
                  <ul className={styles.list}>
                    {job.requirements.niceToHave.length === 0 && (
                      <li className={styles.none}>{t('common.noneListed')}</li>
                    )}
                    {job.requirements.niceToHave.map((requirement) => (
                      <li
                        key={requirement}
                        className={`${styles.requirement} ${styles.optional}`}
                      >
                        <PlusCircleIcon size={18} />
                        {requirement}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <div className={styles.descriptionBlock}>
              <Button
                variant="plain"
                size="small"
                className={styles.descriptionToggle}
                aria-expanded={showDescription}
                aria-controls="job-description"
                onClick={() => setShowDescription(!showDescription)}
              >
                {showDescription
                  ? t('jobs.hideDescription')
                  : t('jobs.showDescription')}
              </Button>
              {showDescription && (
                <p id="job-description" className={styles.description}>
                  {job.description}
                </p>
              )}
            </div>
            {job.requirementsGeneratedBy && (
              <Note>
                {t('jobs.readBy', {
                  model: job.requirementsGeneratedBy.model,
                  prompt: job.requirementsGeneratedBy.promptVersion,
                })}
              </Note>
            )}
          </Panel>
        </div>
      </div>
    </section>
  )
}
