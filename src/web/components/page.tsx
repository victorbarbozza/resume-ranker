import { type ReactNode, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import styles from './page.module.css'

/** Whether the app has shown its first screen; after that, a new screen takes the focus to its title */
let shownFirstScreen = false

/**
 * Names the browser tab after the screen, such as `Jobs – Resume Ranker`, so
 * several open tabs can be told apart.
 */
export const useDocumentTitle = (title: string | undefined) => {
  const { t } = useTranslation()
  useEffect(() => {
    document.title = title
      ? `${title} – ${t('common.appName')}`
      : t('common.appName')
  }, [title, t])
}

/** The column every screen sits in */
export function Page({ children }: { children: ReactNode }) {
  return <main className={styles.page}>{children}</main>
}

/**
 * A screen's large title, a line on what it is for, and its main actions.
 * Moving to a new screen puts the focus on its title, so a screen reader
 * announces where the person is; the first screen of a visit keeps the
 * browser's own focus.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useDocumentTitle(title)
  useEffect(() => {
    if (shownFirstScreen) heading.current?.focus({ preventScroll: true })
    shownFirstScreen = true
  }, [])

  return (
    <div className={styles.header}>
      <h1 ref={heading} tabIndex={-1} className={styles.title}>
        {title}
      </h1>
      {actions && <div className={styles.actions}>{actions}</div>}
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  )
}

/** A white surface that groups content, such as a list */
export function Panel({
  children,
  className,
  busy,
}: {
  children: ReactNode
  className?: string
  busy?: boolean
}) {
  return (
    <div
      className={`${styles.panel} ${className ?? ''}`}
      aria-busy={busy || undefined}
    >
      {children}
    </div>
  )
}

/** A section title inside a screen */
export function SectionTitle({
  id,
  children,
}: {
  id?: string
  children: ReactNode
}) {
  return (
    <h2 id={id} className={styles.sectionTitle}>
      {children}
    </h2>
  )
}

/** What a list shows before it has anything, or when it fails, with the action that moves on */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      {children && <p className={styles.emptyText}>{children}</p>}
      {action}
    </div>
  )
}

/**
 * Grey bars in the shape of the rows that are loading. They appear only after
 * 300 ms, so a fast answer never flashes them.
 */
export function Skeleton({
  label,
  rows = 5,
}: {
  label: string
  rows?: number
}) {
  return (
    <div className={styles.skeleton} role="status">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={styles.skeletonRow} aria-hidden="true">
          <span
            className={styles.bar}
            style={{ width: `${38 + ((index * 7) % 18)}%` }}
          />
          <span className={styles.bar} style={{ width: '18%' }} />
          <span className={styles.bar} style={{ width: '14%' }} />
        </div>
      ))}
    </div>
  )
}

/** Small print under a section, such as which model wrote a result */
export function Note({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>
}

/** How many items a filtered list shows, such as `Showing 3 of 20` */
export function ListCount({ children }: { children: ReactNode }) {
  return (
    <p className={styles.count} aria-live="polite">
      {children}
    </p>
  )
}
