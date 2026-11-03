import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
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
  Page,
  PageHeader,
  Panel,
  Skeleton,
} from '@/web/components/page'
import { Select } from '@/web/components/select'
import { ConfirmSheet } from '@/web/components/sheet'
import { StatusLabel, Tag } from '@/web/components/status'
import { describeError } from '@/web/lib/api'
import {
  areaLabel,
  displayName,
  listOf,
  profileLine,
  timeAgo,
} from '@/web/lib/format'
import { useDebounced } from '@/web/lib/use-debounced'

import { CandidateSheet } from './candidate-sheet'
import styles from './candidates.module.css'
import {
  candidatesQuery,
  useDeleteCandidate,
  useDeleteCandidates,
  useRetryProfile,
} from './queries'
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
 * dropping files anywhere on the page or choosing them. The server searches
 * by name, filters by area and status, and answers 50 at a
 * time, newest first, with more on request; nothing is counted. The loaded
 * pages are asked again while a resume on them is being read. A row opens
 * the candidate's profile in a sheet, where the candidate can be deleted.
 */
export function CandidatesPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [area, setArea] = useState<'all' | Area>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const settledSearch = useDebounced(search)
  const {
    data,
    isPending,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...candidatesQuery({
      search: settledSearch,
      area: area === 'all' ? undefined : area,
      status: status === 'all' ? undefined : status,
    }),
    placeholderData: keepPreviousData,
  })
  const retry = useRetryProfile()
  const remove = useDeleteCandidate()
  const removeMany = useDeleteCandidates()
  const dragging = usePageDrop()
  const input = useRef<HTMLInputElement>(null)
  const [selectedId, setSelectedId] = useState<string>()
  const [viewing, setViewing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [checked, setChecked] = useState<string[]>([])
  const [confirmingDeleteMany, setConfirmingDeleteMany] = useState(false)

  const candidates = data?.pages.flatMap((page) => page.candidates) ?? []
  const anyFailed = data?.pages[0]?.anyFailed ?? false
  const selected = candidates.find((candidate) => candidate.id === selectedId)
  const checkedIds = candidates
    .filter((candidate) => checked.includes(candidate.id))
    .map((candidate) => candidate.id)
  const allChecked =
    candidates.length > 0 && checkedIds.length === candidates.length
  const filtered = search.trim() !== '' || area !== 'all' || status !== 'all'
  const empty = !filtered && !isPending && !isError && candidates.length === 0
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
  const toggle = (candidateId: string) =>
    setChecked(
      checked.includes(candidateId)
        ? checked.filter((id) => id !== candidateId)
        : [...checked, candidateId]
    )
  const toggleAll = () =>
    setChecked(allChecked ? [] : candidates.map((candidate) => candidate.id))
  const deleteChecked = () =>
    removeMany.mutate(checkedIds, {
      onSuccess: (deleted) => {
        toast.success(t('candidates.deletedMany', { count: deleted }))
        setChecked([])
        setConfirmingDeleteMany(false)
      },
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
          {anyFailed && status !== 'failed' && (
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
              {t('candidates.failedBanner')}
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
            {checkedIds.length > 0 && (
              <div className={styles.selection}>
                <span aria-live="polite">
                  {t('candidates.selected', { count: checkedIds.length })}
                </span>
                <Button
                  variant="plain"
                  size="small"
                  onClick={() => setChecked([])}
                >
                  {t('candidates.clearSelection')}
                </Button>
                <Button
                  variant="destructive"
                  size="small"
                  onClick={() => setConfirmingDeleteMany(true)}
                >
                  {t('candidates.delete')}
                </Button>
              </div>
            )}
          </div>

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
                <div className={styles.head}>
                  <span className={styles.check}>
                    <input
                      type="checkbox"
                      aria-label={t('candidates.selectAll')}
                      checked={allChecked}
                      onChange={toggleAll}
                    />
                  </span>
                  <span aria-hidden="true">
                    {t('candidates.columnCandidate')}
                  </span>
                  <span aria-hidden="true">{t('candidates.columnAreas')}</span>
                  <span aria-hidden="true">
                    {t('candidates.columnExperience')}
                  </span>
                  <span aria-hidden="true">{t('candidates.columnStatus')}</span>
                  <span aria-hidden="true" className={styles.end}>
                    {t('candidates.columnAdded')}
                  </span>
                </div>
                <ul className={styles.rows}>
                  {candidates.map((candidate) => (
                    <li key={candidate.id} className={styles.row}>
                      <span className={styles.check}>
                        <input
                          type="checkbox"
                          aria-label={t('candidates.selectLabel', {
                            name: displayName(candidate),
                          })}
                          checked={checked.includes(candidate.id)}
                          onChange={() => toggle(candidate.id)}
                        />
                      </span>
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
                        {candidate.stale && (
                          <span className={styles.hideOnPhone}>
                            <Tag tone="stale">{t('common.stale')}</Tag>
                          </span>
                        )}
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
                {hasNextPage && (
                  <div className={styles.more}>
                    <Button
                      variant="plain"
                      loading={isFetchingNextPage}
                      onClick={() => fetchNextPage()}
                    >
                      {t('common.loadMore')}
                    </Button>
                  </div>
                )}
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
      <ConfirmSheet
        open={confirmingDeleteMany}
        onClose={() => {
          setConfirmingDeleteMany(false)
          removeMany.reset()
        }}
        title={t('candidates.deleteManyTitle', { count: checkedIds.length })}
        description={t('candidates.deleteText')}
        confirmLabel={t('candidates.deleteManyConfirm', {
          count: checkedIds.length,
        })}
        onConfirm={deleteChecked}
        pending={removeMany.isPending}
        error={removeMany.error ? describeError(removeMany.error) : undefined}
      />
    </Page>
  )
}
