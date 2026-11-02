import type { ReactNode } from 'react'

import { CrossCircleIcon, SpinnerIcon, WarningIcon } from './icons'
import styles from './status.module.css'

/**
 * Where background work stands, always as a word and a shape, never color
 * alone: a dot when ready, a spinner while pending, a crossed circle when failed.
 */
export function StatusLabel({
  tone,
  children,
}: {
  tone: 'ready' | 'pending' | 'failed'
  children: ReactNode
}) {
  return (
    <span className={`${styles.status} ${styles[tone]}`}>
      {tone === 'ready' && <span className={styles.dot} aria-hidden="true" />}
      {tone === 'pending' && <SpinnerIcon size={14} />}
      {tone === 'failed' && <CrossCircleIcon size={14} />}
      {children}
    </span>
  )
}

/**
 * A short flag on a row.
 *
 * - `stale`: made for an older job or prompt version; carries the warning triangle
 * - `other`: picked from another area
 * - `placeholder`: written by the fake model; dashed, as nothing real yet
 * - `planned`: a feature that does not exist yet
 */
export function Tag({
  tone,
  children,
}: {
  tone: 'stale' | 'other' | 'placeholder' | 'planned' | 'neutral'
  children: ReactNode
}) {
  return (
    <span className={`${styles.tag} ${styles[tone]}`}>
      {tone === 'stale' && <WarningIcon size={11} />}
      {children}
    </span>
  )
}
