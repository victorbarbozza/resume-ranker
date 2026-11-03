import { useTranslation } from 'react-i18next'

import type { ListedCandidate } from '@/server/domains/candidates/services/candidates'
import { Button } from '@/web/components/button'
import { Banner } from '@/web/components/controls'
import { Note } from '@/web/components/page'
import { Sheet } from '@/web/components/sheet'
import { StatusLabel, Tag } from '@/web/components/status'
import {
  areaLabel,
  displayName,
  listOf,
  profileLine,
  timeAgo,
} from '@/web/lib/format'

import styles from './candidates.module.css'

/**
 * Props of the candidate sheet.
 *
 * - `candidate`: the one shown; the sheet keeps showing it while it closes
 * - `retrying`: a new read of this resume is being queued
 */
interface CandidateSheetProps {
  candidate: ListedCandidate | undefined
  open: boolean
  onClose: () => void
  onRetry: () => void
  retrying: boolean
  onDelete: () => void
}

/**
 * What the model read from one resume: experience, areas, skills, languages
 * and a summary, with which model read it. While the resume is being read the
 * sheet says so; a resume that could not be read, or was read with an older
 * prompt, can be read again. Delete
 * sits at the far left, away from Close.
 */
export function CandidateSheet({
  candidate,
  open,
  onClose,
  onRetry,
  retrying,
  onDelete,
}: CandidateSheetProps) {
  const { t } = useTranslation()
  if (!candidate) return null
  const profile = candidate.profile

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={displayName(candidate)}
      description={
        candidate.name
          ? t('candidates.fileLine', {
              file: candidate.fileName,
              when: timeAgo(candidate.createdAt),
            })
          : t('common.added', { when: timeAgo(candidate.createdAt) })
      }
      closeLabel={t('common.close')}
      footerStart={
        <Button variant="plainDestructive" onClick={onDelete}>
          {t('candidates.delete')}
        </Button>
      }
    >
      {candidate.status === 'pending' && (
        <div className={styles.sheetState}>
          <StatusLabel tone="pending">
            {t('candidates.readingTitle')}
          </StatusLabel>
          <p>{t('candidates.readingText')}</p>
        </div>
      )}
      {candidate.status === 'failed' && (
        <Banner
          tone="error"
          action={
            <Button
              size="small"
              variant="tinted"
              loading={retrying}
              onClick={onRetry}
            >
              {t('common.tryAgain')}
            </Button>
          }
        >
          {t('candidates.failedText')}
        </Banner>
      )}
      {candidate.stale && (
        <Banner
          tone="warning"
          action={
            <Button
              size="small"
              variant="tinted"
              loading={retrying}
              onClick={onRetry}
            >
              {t('candidates.readAgain')}
            </Button>
          }
        >
          {t('candidates.staleText')}
        </Banner>
      )}
      {profile && (
        <dl className={styles.profile}>
          <div className={styles.fact}>
            <dt>{t('candidates.experience')}</dt>
            <dd>{profileLine(profile)}</dd>
          </div>
          <div className={styles.fact}>
            <dt>{t('candidates.areas')}</dt>
            <dd className={styles.chips}>
              {candidate.areas.length === 0
                ? t('common.noneListed')
                : candidate.areas.map((area) => (
                    <Tag key={area} tone="neutral">
                      {areaLabel(area)}
                    </Tag>
                  ))}
            </dd>
          </div>
          <div className={styles.fact}>
            <dt>{t('candidates.skills')}</dt>
            <dd className={styles.chips}>
              {profile.skills.length === 0
                ? t('common.noneListed')
                : profile.skills.map((skill) => (
                    <span key={skill} className={styles.chip}>
                      {skill}
                    </span>
                  ))}
            </dd>
          </div>
          <div className={styles.fact}>
            <dt>{t('candidates.languages')}</dt>
            <dd>
              {profile.languages.length === 0
                ? t('common.noneListed')
                : listOf(profile.languages)}
            </dd>
          </div>
          <div className={`${styles.fact} ${styles.factWide}`}>
            <dt>{t('candidates.summary')}</dt>
            <dd className={styles.profileSummary}>
              {profile.summary || t('common.noneListed')}
            </dd>
          </div>
        </dl>
      )}
      {candidate.profileGeneratedBy && (
        <Note>
          {t('candidates.readBy', {
            model: candidate.profileGeneratedBy.model,
            prompt: candidate.profileGeneratedBy.promptVersion,
          })}
        </Note>
      )}
    </Sheet>
  )
}
