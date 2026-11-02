import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { IJob } from '@/server/shared/schemas/job.schema'
import { AREAS, type Area } from '@/shared/areas'
import { Button } from '@/web/components/button'
import { SearchField, Segmented } from '@/web/components/controls'
import { ChevronRightIcon, PlusIcon } from '@/web/components/icons'
import {
  EmptyState,
  ListCount,
  Page,
  PageHeader,
  Panel,
  Skeleton,
} from '@/web/components/page'
import { Select } from '@/web/components/select'
import { StatusLabel } from '@/web/components/status'
import { describeError } from '@/web/lib/api'
import { areaLabel, timeAgo } from '@/web/lib/format'

import { JobForm } from './job-form'
import styles from './jobs.module.css'
import { jobsQuery, useRetryAnalysis } from './queries'

/** The status filter: every job, or one status */
type StatusFilter = 'all' | IJob['status']

/**
 * Every job, with where its analysis stands. The list filters by title, area
 * and status, and asks again while an analysis is pending. New job opens the
 * form in a sheet; a failed analysis retries from its row.
 */
export function JobsPage() {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useQuery(jobsQuery)
  const retry = useRetryAnalysis()
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [area, setArea] = useState<'all' | Area>('all')
  const [status, setStatus] = useState<StatusFilter>('all')

  const all = data?.jobs ?? []
  const jobs = all.filter(
    (job) =>
      job.title.toLowerCase().includes(search.trim().toLowerCase()) &&
      (area === 'all' || job.area === area) &&
      (status === 'all' || job.status === status)
  )
  const filtered = search.trim() !== '' || area !== 'all' || status !== 'all'
  const clearFilters = () => {
    setSearch('')
    setArea('all')
    setStatus('all')
  }
  const statusLabels: Record<IJob['status'], string> = {
    ready: t('common.ready'),
    pending: t('common.reading'),
    failed: t('common.failed'),
  }
  const retryAnalysis = (jobId: string) =>
    retry.mutate(jobId, {
      onSuccess: () => toast.success(t('jobs.retried')),
      onError: (error) => toast.error(describeError(error)),
    })

  return (
    <Page>
      <PageHeader
        title={t('jobs.title')}
        subtitle={t('jobs.subtitle')}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <PlusIcon size={16} />
            {t('jobs.newJob')}
          </Button>
        }
      />

      <section className={styles.list} aria-label={t('jobs.title')}>
        <div className={styles.toolbar}>
          <div className={styles.search}>
            <SearchField
              label={t('jobs.search')}
              placeholder={t('jobs.searchPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select
            variant="filter"
            label={t('common.area')}
            value={area}
            onChange={setArea}
            choices={[
              { value: 'all', label: t('common.allAreas') },
              ...AREAS.map((option) => ({
                value: option,
                label: areaLabel(option),
              })),
            ]}
          />
          <Segmented<StatusFilter>
            label={t('jobs.statusFilter')}
            value={status}
            onChange={setStatus}
            segments={[
              { value: 'all', label: t('common.all') },
              { value: 'ready', label: t('common.ready') },
              { value: 'pending', label: t('common.reading') },
              { value: 'failed', label: t('common.failed') },
            ]}
          />
        </div>

        {all.length > 0 && (
          <ListCount>
            {filtered
              ? t('common.showing', { shown: jobs.length, total: all.length })
              : t('jobs.count', { count: all.length })}
          </ListCount>
        )}

        <Panel busy={isPending}>
          {isPending ? (
            <Skeleton label={t('common.loading')} />
          ) : isError ? (
            <EmptyState
              title={t('jobs.loadFailed')}
              action={
                <Button onClick={() => refetch()}>
                  {t('common.tryAgain')}
                </Button>
              }
            >
              {t('errors.ERR_NETWORK')}
            </EmptyState>
          ) : all.length === 0 ? (
            <EmptyState
              title={t('jobs.empty')}
              action={
                <Button variant="primary" onClick={() => setCreating(true)}>
                  {t('jobs.newJob')}
                </Button>
              }
            >
              {t('jobs.emptyText')}
            </EmptyState>
          ) : jobs.length === 0 ? (
            <EmptyState
              title={t('jobs.noMatch')}
              action={
                <Button onClick={clearFilters}>
                  {t('common.clearFilters')}
                </Button>
              }
            >
              {t('jobs.noMatchText')}
            </EmptyState>
          ) : (
            <div className={styles.table}>
              <div className={styles.head} aria-hidden="true">
                <span>{t('jobs.columnTitle')}</span>
                <span>{t('jobs.columnArea')}</span>
                <span>{t('jobs.columnRequirements')}</span>
                <span className={styles.end}>{t('jobs.columnUpdated')}</span>
              </div>
              <ul className={styles.rows}>
                {jobs.map((job) => (
                  <li key={job.id} className={styles.row}>
                    <div className={styles.main}>
                      <Link
                        to="/jobs/$jobId"
                        params={{ jobId: job.id }}
                        className={styles.titleLink}
                      >
                        {job.title}
                      </Link>
                      <span className={styles.sub}>
                        {t('jobs.rowLine', {
                          area: areaLabel(job.area),
                          when: timeAgo(job.updatedAt),
                        })}
                      </span>
                    </div>
                    <span
                      className={`${styles.secondary} ${styles.hideOnPhone}`}
                    >
                      {areaLabel(job.area)}
                    </span>
                    <span className={styles.status}>
                      <StatusLabel tone={job.status}>
                        {statusLabels[job.status]}
                      </StatusLabel>
                      {job.status === 'failed' && (
                        <Button
                          variant="tinted"
                          size="small"
                          className={styles.hideOnPhone}
                          loading={
                            retry.isPending && retry.variables === job.id
                          }
                          onClick={() => retryAnalysis(job.id)}
                        >
                          {t('common.tryAgain')}
                        </Button>
                      )}
                    </span>
                    <span
                      className={`${styles.muted} ${styles.end} ${styles.hideOnPhone}`}
                    >
                      {timeAgo(job.updatedAt)}
                    </span>
                    <ChevronRightIcon size={14} className={styles.chevron} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </section>

      <JobForm open={creating} onClose={() => setCreating(false)} />
    </Page>
  )
}
