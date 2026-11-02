import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/web/components/button'
import { Banner, ProgressBar } from '@/web/components/controls'
import {
  CheckIcon,
  CopyIcon,
  CrossIcon,
  DocumentIcon,
  SpinnerIcon,
  UploadIcon,
} from '@/web/components/icons'
import { Panel } from '@/web/components/page'
import { fileSize } from '@/web/lib/format'

import styles from './candidates.module.css'
import {
  addResumes,
  clearUploads,
  isOpen,
  sendFailedAgain,
  type Upload,
  type UploadStatus,
  useUploads,
} from './uploads'

/** Rows the list shows before Show all */
const SHOWN_UPLOADS = 6

/** The order files are listed in: what went wrong first, then what is on its way, then what is done */
const STATUS_ORDER: UploadStatus[] = [
  'failed',
  'rejected',
  'sending',
  'waiting',
  'added',
  'duplicate',
]

/**
 * Whether files are being dragged over the page. Files dropped anywhere on it
 * are added; anything else dragged around is left to the browser.
 */
export const usePageDrop = () => {
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const carriesFiles = (event: DragEvent) =>
      event.dataTransfer?.types.includes('Files') ?? false
    const enter = (event: DragEvent) => {
      if (carriesFiles(event)) setDragging(true)
    }
    const over = (event: DragEvent) => {
      if (carriesFiles(event)) event.preventDefault()
    }
    const leave = (event: DragEvent) => {
      if (!event.relatedTarget) setDragging(false)
    }
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      setDragging(false)
      addResumes([...(event.dataTransfer?.files ?? [])])
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return dragging
}

/** What covers the page while files are dragged over it */
export function DropOverlay() {
  const { t } = useTranslation()
  return (
    <div className={styles.overlay} aria-hidden="true">
      <div className={styles.overlayFrame}>
        <UploadIcon size={36} />
        <p>{t('candidates.overlay')}</p>
      </div>
    </div>
  )
}

/**
 * Where resumes come in: a large area while there are no candidates, then a
 * slim line above the list. A phone cannot drag files, so it shows the button.
 */
export function DropZone({
  compact,
  onChoose,
}: {
  compact: boolean
  onChoose: () => void
}) {
  const { t } = useTranslation()
  if (compact) {
    return (
      <p className={styles.strip}>
        <UploadIcon size={16} />
        <span>
          {t('candidates.strip')}{' '}
          <button type="button" className={styles.inline} onClick={onChoose}>
            {t('candidates.chooseInline')}
          </button>
          .
        </span>
      </p>
    )
  }
  return (
    <div className={styles.drop}>
      <DocumentIcon size={40} />
      <p className={styles.dropTitle}>{t('candidates.dropTitle')}</p>
      <p className={styles.dropText}>{t('candidates.dropText')}</p>
      <Button variant="primary" size="large" onClick={onChoose}>
        {t('candidates.choose')}
      </Button>
    </div>
  )
}

/** The icon of each status */
function StatusIcon({ status }: { status: UploadStatus }) {
  if (status === 'added') return <CheckIcon size={15} />
  if (status === 'duplicate') return <CopyIcon size={15} />
  if (status === 'rejected' || status === 'failed') {
    return <CrossIcon size={15} />
  }
  if (status === 'sending') return <SpinnerIcon size={15} />
  return null
}

/**
 * The files chosen in this tab and what happened to each, with a bar while
 * they are on their way and a count once they all have an answer. Files that
 * got no answer can be sent again; the list can be cleared once nothing is
 * left to send.
 */
export function UploadQueue() {
  const { t } = useTranslation()
  const uploads = useUploads()
  const [showAll, setShowAll] = useState(false)

  if (uploads.length === 0) return null

  const total = (status: UploadStatus) =>
    uploads.filter((upload) => upload.status === status).length
  const open = uploads.filter(isOpen).length
  const added = total('added')
  const duplicates = total('duplicate')
  const rejected = total('rejected')
  const failed = total('failed')
  const sorted = STATUS_ORDER.flatMap((status) =>
    uploads.filter((upload) => upload.status === status)
  )
  const shown = showAll ? sorted : sorted.slice(0, SHOWN_UPLOADS)
  const statusText = (upload: Upload) => {
    if (upload.status === 'rejected' || upload.status === 'failed') {
      return t(`errors.${upload.reason ?? 'UNKNOWN'}`)
    }
    if (upload.status === 'waiting') return t('candidates.statusWaiting')
    if (upload.status === 'sending') return t('candidates.statusSending')
    if (upload.status === 'added') return t('candidates.statusAdded')
    return t('candidates.statusDuplicate')
  }

  return (
    <Panel className={styles.queue}>
      <div className={styles.queueHead}>
        <div className={styles.queueTitle}>
          <p className={styles.queueHeadline} aria-live="polite">
            {open > 0
              ? t('candidates.adding', { count: open })
              : added > 0
                ? t('candidates.addedCount', { count: added })
                : t('candidates.noneAdded')}
          </p>
          <p className={styles.queueSummary}>
            {[
              duplicates > 0 &&
                t('candidates.duplicates', { count: duplicates }),
              rejected > 0 && t('candidates.notAdded', { count: rejected }),
              failed > 0 && t('candidates.sendFailed', { count: failed }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className={styles.queueActions}>
          {failed > 0 && (
            <Button
              size="small"
              variant="tinted"
              disabled={open > 0}
              onClick={sendFailedAgain}
            >
              {t('candidates.sendAgain', { count: failed })}
            </Button>
          )}
          <Button size="small" disabled={open > 0} onClick={clearUploads}>
            {t('candidates.clearList')}
          </Button>
        </div>
        {open > 0 && (
          <div className={styles.queueProgress}>
            <ProgressBar
              label={t('candidates.uploadProgress')}
              valueText={t('ranking.progressText', {
                done: uploads.length - open,
                total: uploads.length,
              })}
              total={uploads.length}
              parts={[
                { amount: added + duplicates, color: 'var(--meter)' },
                { amount: rejected + failed, color: 'var(--danger-dot)' },
              ]}
            />
          </div>
        )}
      </div>
      {open === 0 && rejected > 0 && (
        <div className={styles.queueBanner}>
          <Banner tone="warning">
            {t('candidates.rejectedBanner', { count: rejected })}
          </Banner>
        </div>
      )}
      <ul>
        {shown.map((upload) => (
          <li key={upload.key} className={styles.upload}>
            <DocumentIcon size={18} className={styles.uploadIcon} />
            <span className={styles.uploadName}>{upload.file.name}</span>
            <span className={styles.uploadSize}>
              {fileSize(upload.file.size)}
            </span>
            <span className={`${styles.uploadStatus} ${styles[upload.status]}`}>
              <StatusIcon status={upload.status} />
              {statusText(upload)}
            </span>
          </li>
        ))}
      </ul>
      {sorted.length > SHOWN_UPLOADS && (
        <div className={styles.queueMore}>
          <Button
            variant="plain"
            size="small"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll
              ? t('common.showLess')
              : t('common.showAll', { count: sorted.length })}
          </Button>
        </div>
      )}
    </Panel>
  )
}
