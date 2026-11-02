import { type ReactNode, useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from './button'
import { Banner } from './controls'
import styles from './sheet.module.css'

/**
 * Props of a sheet.
 *
 * - `footer`: the actions; the sheet adds Cancel before them on a computer and at the top left on a phone
 * - `closeLabel`: what Cancel reads as, such as Close on a sheet that only shows something
 * - `size`: `wide` for a list, such as picking candidates; `alert` for a short question, such as a delete
 * - `footerStart`: an action at the far left of the footer, such as deleting what the sheet edits
 */
interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  footer?: ReactNode
  footerStart?: ReactNode
  closeLabel?: string
  size?: 'regular' | 'wide' | 'alert'
  children?: ReactNode
}

/**
 * One task in front of the page: the native modal dialog, so focus stays
 * inside and Escape closes it. It drops from the top on a computer and rises
 * from the bottom on a phone, and leaves the way it came, a little faster.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  footer,
  footerStart,
  closeLabel,
  size = 'regular',
  children,
}: SheetProps) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    if (!open && dialog.current?.open) dialog.current.close()
  }, [open])

  const cancel = () => dialog.current?.close()

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={`${styles.sheet} ${styles[size]}`}
      onClose={onClose}
    >
      <div className={styles.header}>
        <button type="button" className={styles.cancel} onClick={cancel}>
          {closeLabel ?? t('common.cancel')}
        </button>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
      </div>
      {description && (
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
      )}
      {children && <div className={styles.body}>{children}</div>}
      <div className={styles.footer}>
        {footerStart && (
          <span className={styles.footerStart}>{footerStart}</span>
        )}
        <Button className={styles.hideOnPhone} onClick={cancel}>
          {closeLabel ?? t('common.cancel')}
        </Button>
        {footer}
      </div>
    </dialog>
  )
}

/**
 * Asks before something that cannot be undone, such as a delete. It stays
 * open while the action runs and shows a failure inside, so the person can
 * try again or cancel.
 */
export function ConfirmSheet({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending,
  error,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  pending: boolean
  error?: string
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="alert"
      title={title}
      description={description}
      footer={
        <Button variant="destructive" loading={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      }
    >
      {error && <Banner tone="error">{error}</Banner>}
    </Sheet>
  )
}
