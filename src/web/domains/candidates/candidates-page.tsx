import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { ICandidate } from '@/server/shared/schemas/candidate.schema'
import { AREAS, type Area } from '@/shared/areas'
import { Button } from '@/web/components/button'
import { Banner, SearchField, Segmented } from '@/web/components/controls'
import { ChevronRightIcon, UploadIcon } from '@/web/components/icons'
import {
  EmptyState,
  ListCount,
  Page,
  PageHeader,
  Panel,
  Skeleton,
} from '@/web/components/page'
import { Select } from '@/web/components/select'
import { ConfirmSheet } from '@/web/components/sheet'
import { StatusLabel } from '@/web/components/status'
import { describeError } from '@/web/lib/api'
import {
  areaLabel,
  displayName,
  listOf,
  profileLine,
  timeAgo,
} from '@/web/lib/format'

import { CandidateSheet } from './candidate-sheet'
import styles from './candidates.module.css'
import { candidatesQuery, useDeleteCandidate, useRetryProfile } from './queries'
import {
  DropOverlay,
  DropZone,
  UploadQueue,
  usePageDrop,
} from './resume-upload'
import { addResumes } from './uploads'

/** The status filter: every candidate, or one status */
type StatusFilter = 'all' | ICandidate['status']

/**
 * Every resume in the base and where reading it stands. Resumes come in by
 * dropping files anywhere on the page or choosing them; the list filters by
 * name, file, skill, area and status, and asks again while any resume is being
 * read. A row opens the candidate's profile in a sheet, where the candidate
 * can be deleted.
 */
export function CandidatesPage() {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useQuery(candidatesQuery)
  const retry = useRetryProfile()
  const remove = useDeleteCandidate()
  const dragging = usePageDrop()
  const input = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [area, setArea] = useState<'all' | Area>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [selectedId, setSelectedId] = useState<string>()
  const [viewing, setViewing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const all = data?.candidates ?? []
  const selected = all.find((candidate) => candidate.id === selectedId)
  const term = search.trim().toLowerCase()
  const filtered = term !== '' || area !== 'all' || status !== 'all'
  const candidates = all.filter(
    (candidate) =>
      [
        displayName(candidate),
        candidate.fileName,
        ...(candidate.profile?.skills ?? []),
      ].some((text) => text.toLowerCase().includes(term)) &&
      (area === 'all' || candidate.areas.includes(area)) &&
      (status === 'all' || candidate.status === status)
  )
  const failedCount = all.filter(
    (candidate) => candidate.status === 'failed'
  ).length
  const empty = !isPending && !isError && all.length === 0
  const statusLabels = {
    ready: t('common.ready'),
    pending: t('common.reading'),
    failed: t('candidates.couldNotRead'),
  }

  const chooseFiles = () => input.current?.click()
  const clearFilters = () => {
    setSearch('')
    setArea('all')
    setStatus('all')
  }
  const retryProfile = (candidateId: string) =>
    retry.mutate(candidateId, {
      onSuccess: () => toast.success(t('candidates.retried')),
      onError: (error) => toast.error(describeError(error)),
    })
  const deleteCandidate = (candidate: ICandidate) =>
    remove.mutate(candidate.id, {
      onSuccess: () => {
        toast.success(t('candidates.deleted', { name: displayName(candidate) }))
        setConfirmingDelete(false)
      },
    })

  return (
    <Page>
      <input
        ref={input}
        type="file"
        multiple
        accept=".pdf,.docx"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          addResumes([...(event.target.files ?? [])])
          event.target.value = ''
        }}
      />
      {dragging && <DropOverlay />}

      <PageHeader
        title={t('candidates.title')}
        subtitle={t('candidates.subtitle')}
        actions={
          !empty && (
            <Button variant="primary" onClick={chooseFiles}>
              <UploadIcon size={16} />
              {t('candidates.add')}
            </Button>
          )
        }
      />

      {!isPending && !isError && (
        <DropZone compact={!empty} onChoose={chooseFiles} />
      )}
      <UploadQueue />

      {!empty && (
        <section className={styles.list}>
          {failedCount > 0 && status !== 'failed' && (
            <Banner
              tone="warning"
              action={
                <Button
                  size="small"
                  variant="tinted"
                  onClick={() => setStatus('failed')}
                >
                  {t('candidates.showFailed')}
                </Button>
              }
            >
              {t('candidates.failedBanner', { count: failedCount })}
            </Banner>
          )}

          <div className={styles.toolbar}>
            <div className={styles.search}>
              <SearchField
                label={t('candidates.search')}
                placeholder={t('candidates.searchPlaceholder')}
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
              label={t('candidates.statusFilter')}
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
                ? t('common.showing', {
                    shown: candidates.length,
                    total: all.length,
                  })
                : t('candidates.count', { count: all.length })}
            </ListCount>
          )}

          <Panel busy={isPending}>
            {isPending ? (
              <Skeleton label={t('common.loading')} />
            ) : isError ? (
              <EmptyState
                title={t('candidates.loadFailed')}
                action={
                  <Button onClick={() => refetch()}>
                    {t('common.tryAgain')}
                  </Button>
                }
              >
                {t('errors.ERR_NETWORK')}
              </EmptyState>
            ) : candidates.length === 0 ? (
              <EmptyState
                title={t('candidates.noMatch')}
                action={
                  <Button onClick={clearFilters}>
                    {t('common.clearFilters')}
                  </Button>
                }
              >
                {t('candidates.noMatchText')}
              </EmptyState>
            ) : (
              <div className={styles.table}>
                <div className={styles.head} aria-hidden="true">
                  <span>{t('candidates.columnCandidate')}</span>
                  <span>{t('candidates.columnAreas')}</span>
                  <span>{t('candidates.columnExperience')}</span>
                  <span>{t('candidates.columnStatus')}</span>
                  <span className={styles.end}>
                    {t('candidates.columnAdded')}
                  </span>
                </div>
                <ul className={styles.rows}>
                  {candidates.map((candidate) => (
                    <li key={candidate.id} className={styles.row}>
                      <div className={styles.main}>
                        <button
                          type="button"
                          className={styles.nameButton}
                          onClick={() => {
                            setSelectedId(candidate.id)
                            setViewing(true)
                          }}
                        >
                          {displayName(candidate)}
                        </button>
                        {candidate.name && (
                          <span
                            className={`${styles.sub} ${styles.hideOnPhone}`}
                          >
                            {candidate.fileName}
                          </span>
                        )}
                        <span className={`${styles.sub} ${styles.phoneOnly}`}>
                          {[
                            profileLine(candidate.profile),
                            listOf(candidate.areas.map(areaLabel)),
                          ]
                            .filter(Boolean)
                            .join(' · ') || timeAgo(candidate.createdAt)}
                        </span>
                      </div>
                      <span
                        className={`${styles.secondary} ${styles.hideOnPhone}`}
                      >
                        {listOf(candidate.areas.map(areaLabel)) || '–'}
                      </span>
                      <span
                        className={`${styles.secondary} ${styles.hideOnPhone}`}
                      >
                        {profileLine(candidate.profile) || '–'}
                      </span>
                      <span className={styles.status}>
                        <StatusLabel tone={candidate.status}>
                          {statusLabels[candidate.status]}
                        </StatusLabel>
                        {candidate.status === 'failed' && (
                          <Button
                            variant="tinted"
                            size="small"
                            className={styles.hideOnPhone}
                            aria-label={t('candidates.retryLabel', {
                              name: displayName(candidate),
                            })}
                            loading={
                              retry.isPending &&
                              retry.variables === candidate.id
                            }
                            onClick={() => retryProfile(candidate.id)}
                          >
                            {t('common.tryAgain')}
                          </Button>
                        )}
                      </span>
                      <span
                        className={`${styles.muted} ${styles.end} ${styles.hideOnPhone}`}
                      >
                        {timeAgo(candidate.createdAt)}
                      </span>
                      <ChevronRightIcon size={14} className={styles.chevron} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </section>
      )}

      <CandidateSheet
        candidate={selected}
        open={viewing}
        onClose={() => setViewing(false)}
        onRetry={() => selected && retryProfile(selected.id)}
        retrying={retry.isPending && retry.variables === selectedId}
        onDelete={() => {
          setViewing(false)
          setConfirmingDelete(true)
        }}
      />
      {selected && (
        <ConfirmSheet
          open={confirmingDelete}
          onClose={() => {
            setConfirmingDelete(false)
            remove.reset()
          }}
          title={t('candidates.deleteTitle', { name: displayName(selected) })}
          description={t('candidates.deleteText')}
          confirmLabel={t('candidates.deleteConfirm')}
          onConfirm={() => deleteCandidate(selected)}
          pending={remove.isPending}
          error={remove.error ? describeError(remove.error) : undefined}
        />
      )}
    </Page>
  )
}
