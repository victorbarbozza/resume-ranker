import { type ComponentProps, type ReactNode, useId } from 'react'

import styles from './field.module.css'
import { type Choice, Select } from './select'

/**
 * What every field shows around its control.
 *
 * - `hint`: helper text under the control
 * - `counter`: text at the right of the label, such as a character count
 * - `error`: the problem, in place of the hint; marks the control invalid
 */
interface FieldFrame {
  label: string
  hint?: ReactNode
  counter?: ReactNode
  error?: string
}

/** Label, control, then the error or the hint, wired for screen readers */
function Field({
  id,
  label,
  hint,
  counter,
  error,
  children,
}: FieldFrame & { id: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {counter && <span className={styles.counter}>{counter}</span>}
      </div>
      {children}
      {error ? (
        <p id={`${id}-message`} className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-message`} className={styles.hint}>
            {hint}
          </p>
        )
      )}
    </div>
  )
}

/** A one-line text field */
export function TextField({
  label,
  hint,
  counter,
  error,
  ...props
}: FieldFrame & ComponentProps<'input'>) {
  const id = useId()
  return (
    <Field id={id} label={label} hint={hint} counter={counter} error={error}>
      <input
        id={id}
        className={`${styles.control} ${styles.input}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${id}-message` : undefined}
        {...props}
      />
    </Field>
  )
}

/** A choice from a short list: the app's own list with a mouse, the system's picker on a touch screen */
export function SelectField<T extends string>({
  label,
  hint,
  error,
  value,
  choices,
  onChange,
}: FieldFrame & {
  value: T
  choices: Choice<T>[]
  onChange: (value: T) => void
}) {
  const id = useId()
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <Select
        id={id}
        variant="field"
        label={label}
        value={value}
        choices={choices}
        onChange={onChange}
        invalid={Boolean(error)}
        describedBy={error || hint ? `${id}-message` : undefined}
      />
    </Field>
  )
}

/** A long text field */
export function TextAreaField({
  label,
  hint,
  counter,
  error,
  ...props
}: FieldFrame & ComponentProps<'textarea'>) {
  const id = useId()
  return (
    <Field id={id} label={label} hint={hint} counter={counter} error={error}>
      <textarea
        id={id}
        className={`${styles.control} ${styles.textarea}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${id}-message` : undefined}
        {...props}
      />
    </Field>
  )
}
