import {
  type KeyboardEvent,
  type ReactNode,
  type ToggleEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

import { useMediaQuery } from '@/web/lib/use-media-query'

import { CheckIcon, ChevronUpDownIcon } from './icons'
import styles from './select.module.css'

/** One choice of a select; `lang` when the label is in its own language, such as a language name */
export type Choice<T extends string> = {
  value: T
  label: string
  lang?: string
}

/**
 * Props of a select.
 *
 * - `label`: the name screen readers announce; a field also shows it above
 * - `variant`: `filter` above a list, `field` inside a form, `quiet` in a corner, such as the language
 * - `icon`: drawn before the chosen value, such as the globe
 * - `describedBy`: the id of the hint or error under a field
 */
interface SelectProps<T extends string> {
  label: string
  value: T
  choices: Choice<T>[]
  onChange: (value: T) => void
  variant: 'filter' | 'field' | 'quiet'
  icon?: ReactNode
  id?: string
  invalid?: boolean
  describedBy?: string
}

/** Pointers that tap rather than point; there the system's own picker is the better one */
const TOUCH_QUERY = '(pointer: coarse)'
/** Room kept between the list and the window's edges, in px */
const EDGE = 8
/** Space between the button and its list, in px */
const GAP = 4
/** Room below the button that is enough to open the list downwards, in px */
const ROOM = 240

/**
 * A choice from a short list. With a mouse it opens the app's own list under
 * the button, or above it when there is no room: arrows, Home and End move,
 * a letter jumps to the next choice that starts with it, Enter or a click
 * picks, Escape closes. On a touch screen it opens the system's picker.
 */
export function Select<T extends string>({
  label,
  value,
  choices,
  onChange,
  variant,
  icon,
  id,
  invalid,
  describedBy,
}: SelectProps<T>) {
  const touch = useMediaQuery(TOUCH_QUERY)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const chosen = choices.find((choice) => choice.value === value)
  const last = choices.length - 1

  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event.target !== list.current) list.current?.hidePopover()
    }
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      document
        .getElementById(`${listId}-${active}`)
        ?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, active, listId])

  const face = (
    <>
      {icon}
      <span className={styles.value}>{chosen?.label}</span>
      <ChevronUpDownIcon size={14} className={styles.chevron} />
    </>
  )

  if (touch) {
    return (
      <span className={`${styles.trigger} ${styles[variant]} ${styles.native}`}>
        {face}
        <select
          id={id}
          aria-label={label}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          value={value}
          onChange={(event) => {
            const picked = choices.find(
              (choice) => choice.value === event.target.value
            )
            if (picked) onChange(picked.value)
          }}
        >
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value} lang={choice.lang}>
              {choice.label}
            </option>
          ))}
        </select>
      </span>
    )
  }

  const place = (event: ToggleEvent<HTMLUListElement>) => {
    const button = trigger.current
    if (event.newState !== 'open' || !button) return
    const { clientWidth, clientHeight } = document.documentElement
    const rect = button.getBoundingClientRect()
    const roomBelow = clientHeight - rect.bottom - GAP - EDGE
    const roomAbove = rect.top - GAP - EDGE
    const below = roomBelow >= ROOM || roomBelow >= roomAbove
    const fromRight = rect.left > clientWidth / 2
    Object.assign(event.currentTarget.style, {
      top: below ? `${rect.bottom + GAP}px` : 'auto',
      bottom: below ? 'auto' : `${clientHeight - rect.top + GAP}px`,
      left: fromRight ? 'auto' : `${rect.left}px`,
      right: fromRight ? `${clientWidth - rect.right}px` : 'auto',
      minWidth: `${rect.width}px`,
      maxHeight: `${below ? roomBelow : roomAbove}px`,
    })
    event.currentTarget.dataset.side = below ? 'below' : 'above'
    setActive(
      Math.max(
        0,
        choices.findIndex((choice) => choice.value === value)
      )
    )
  }
  const close = () => {
    list.current?.hidePopover()
    trigger.current?.focus()
  }
  const choose = (index: number) => {
    const choice = choices[index]
    if (choice) onChange(choice.value)
    close()
  }
  const keys: Record<string, () => void> = {
    ArrowDown: () => setActive(Math.min(active + 1, last)),
    ArrowUp: () => setActive(Math.max(active - 1, 0)),
    Home: () => setActive(0),
    End: () => setActive(last),
    Enter: () => choose(active),
    ' ': () => choose(active),
    Escape: close,
    Tab: close,
  }
  const press = (event: KeyboardEvent<HTMLUListElement>) => {
    const action = keys[event.key]
    if (action) {
      if (event.key !== 'Tab') event.preventDefault()
      action()
      return
    }
    if (event.key.length !== 1) return
    const letter = event.key.toLowerCase()
    const next = [
      ...choices.slice(active + 1),
      ...choices.slice(0, active + 1),
    ].find((choice) => choice.label.toLowerCase().startsWith(letter))
    if (next) setActive(choices.indexOf(next))
  }

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        popoverTarget={listId}
        className={`${styles.trigger} ${styles[variant]}`}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          list.current?.showPopover()
          list.current?.focus()
        }}
      >
        {face}
      </button>
      <ul
        ref={list}
        id={listId}
        popover="auto"
        role="listbox"
        aria-label={label}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        tabIndex={-1}
        className={styles.list}
        onBeforeToggle={place}
        onToggle={(event) => {
          setOpen(event.newState === 'open')
          if (event.newState === 'open') list.current?.focus()
        }}
        onKeyDown={press}
        onClick={(event) => {
          const option =
            event.target instanceof Element ? event.target.closest('li') : null
          if (option) choose(Number(option.dataset.index))
        }}
      >
        {choices.map((choice, index) => (
          <li
            key={choice.value}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={choice.value === value}
            data-active={index === active}
            data-index={index}
            lang={choice.lang}
            tabIndex={-1}
            className={styles.option}
            onPointerMove={() => setActive(index)}
          >
            <CheckIcon size={13} className={styles.check} />
            {choice.label}
          </li>
        ))}
      </ul>
    </>
  )
}
