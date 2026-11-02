import type { ButtonHTMLAttributes, MouseEvent } from 'react'

import styles from './button.module.css'
import { SpinnerIcon } from './icons'

/**
 * Props of a button.
 *
 * - `variant`: `primary` for the one main action of an area; `tinted` for actions inside rows; `destructive` for delete; `plainDestructive` for delete repeated on every row
 * - `loading`: shows a spinner, keeps the width and the keyboard focus, and ignores presses
 * - `iconOnly`: a square button; give it an `aria-label`
 */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'primary'
    | 'secondary'
    | 'tinted'
    | 'destructive'
    | 'plain'
    | 'plainDestructive'
  size?: 'small' | 'regular' | 'large'
  loading?: boolean
  fullWidth?: boolean
  iconOnly?: boolean
}

/** A real button, pressed down the moment the pointer goes down */
export function Button({
  variant = 'secondary',
  size = 'regular',
  loading = false,
  fullWidth = false,
  iconOnly = false,
  type = 'button',
  className,
  onClick,
  children,
  ...props
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth && styles.full,
    iconOnly && styles.icon,
    className,
  ]
  const press = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }
  return (
    <button
      type={type}
      className={classes.filter(Boolean).join(' ')}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={press}
      {...props}
    >
      {loading && <SpinnerIcon size={15} />}
      {children}
    </button>
  )
}
