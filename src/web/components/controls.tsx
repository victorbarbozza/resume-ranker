import type { ComponentProps, ReactNode } from 'react'

import styles from './controls.module.css'
import { AlertIcon, SearchIcon, WarningIcon } from './icons'

/** One choice of a segmented control */
export type Segment<T extends string> = { value: T; label: string }

/** Props of a segmented control: its choices, the chosen one, and a name for screen readers */
interface SegmentedProps<T extends string> {
  label: string
  segments: Segment<T>[]
  value: T
  onChange: (value: T) => void
}

/** A small set of mutually exclusive choices, such as a filter */
export function Segmented<T extends string>({
  label,
  segments,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className={styles.segmented}>
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          className={styles.segment}
          aria-pressed={segment.value === value}
          onClick={() => onChange(segment.value)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  )
}

/** A search box with its label for screen readers */
export function SearchField({
  label,
  ...props
}: { label: string } & ComponentProps<'input'>) {
  return (
    <label className={styles.search}>
      <span className="visually-hidden">{label}</span>
      <SearchIcon size={16} className={styles.searchIcon} />
      <input type="search" className={styles.searchInput} {...props} />
    </label>
  )
}

/** One colored part of a progress bar */
export type ProgressPart = { amount: number; color: string }

/** A bar split into parts of a total, such as scored, scoring and failed; empty parts take no room */
export function ProgressBar({
  label,
  valueText,
  total,
  parts,
}: {
  label: string
  valueText: string
  total: number
  parts: ProgressPart[]
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={parts[0]?.amount ?? 0}
      aria-valuetext={valueText}
      className={styles.progress}
    >
      {parts
        .filter((part) => part.amount > 0)
        .map((part) => (
          <span
            key={part.color}
            className={styles.progressSegment}
            style={{
              width: `${total ? (part.amount / total) * 100 : 0}%`,
              background: part.color,
            }}
          />
        ))}
    </div>
  )
}

/** A message that sits in the page: a warning before it matters, or an error with the way out */
export function Banner({
  tone,
  children,
  action,
}: {
  tone: 'warning' | 'error'
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div role="status" className={`${styles.banner} ${styles[tone]}`}>
      {tone === 'warning' ? <WarningIcon size={20} /> : <AlertIcon size={20} />}
      <span className={styles.bannerText}>{children}</span>
      {action}
    </div>
  )
}
