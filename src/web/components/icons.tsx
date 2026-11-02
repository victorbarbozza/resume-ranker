import type { ReactNode, SVGProps } from 'react'

/** Props every icon takes: its size in px, and any SVG attribute */
type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** One stroke icon on a 24-unit grid, hidden from screen readers: the text beside it carries the meaning */
const Icon = ({
  size = 18,
  strokeWidth = 1.8,
  children,
  ...props
}: IconProps & { children: ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
)

/** Jobs: a briefcase */
export const JobsIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="7" width="18" height="13" rx="2.5" />
    <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
  </Icon>
)

/** Candidates: a person */
export const CandidatesIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </Icon>
)

/** Observability: a pulse line */
export const PulseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
  </Icon>
)

/** Back */
export const ChevronLeftIcon = (props: IconProps) => (
  <Icon strokeWidth={2.2} {...props}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
)

/** Forward, or a row that opens */
export const ChevronRightIcon = (props: IconProps) => (
  <Icon strokeWidth={2.4} {...props}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
)

/** Add */
export const PlusIcon = (props: IconProps) => (
  <Icon strokeWidth={2.2} {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

/** Remove, or a gap */
export const MinusIcon = (props: IconProps) => (
  <Icon strokeWidth={2.4} {...props}>
    <path d="M6 12h12" />
  </Icon>
)

/** Search */
export const SearchIcon = (props: IconProps) => (
  <Icon strokeWidth={2.2} {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </Icon>
)

/** More actions */
export const MoreIcon = (props: IconProps) => (
  <Icon stroke="none" fill="currentColor" {...props}>
    <circle cx="5.5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="18.5" cy="12" r="1.6" />
  </Icon>
)

/** A must-have requirement */
export const CheckCircleIcon = (props: IconProps) => (
  <Icon strokeWidth={2} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.7 2.7L16 9.8" />
  </Icon>
)

/** A nice-to-have requirement */
export const PlusCircleIcon = (props: IconProps) => (
  <Icon strokeWidth={2} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </Icon>
)

/** Done */
export const CheckIcon = (props: IconProps) => (
  <Icon strokeWidth={2.4} {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
)

/** Failed or refused */
export const CrossCircleIcon = (props: IconProps) => (
  <Icon strokeWidth={2.2} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </Icon>
)

/** Refused file */
export const CrossIcon = (props: IconProps) => (
  <Icon strokeWidth={2.4} {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

/** A file already in the base */
export const CopyIcon = (props: IconProps) => (
  <Icon strokeWidth={2} {...props}>
    <path d="M8 8h11v11H8zM5 16V5h11" />
  </Icon>
)

/** Warning */
export const WarningIcon = (props: IconProps) => (
  <Icon strokeWidth={2} {...props}>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17.5v.01" />
  </Icon>
)

/** Error */
export const AlertIcon = (props: IconProps) => (
  <Icon strokeWidth={2} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </Icon>
)

/** Work in progress; it turns while shown */
export const SpinnerIcon = (props: IconProps) => (
  <Icon strokeWidth={2.4} className="spinner" {...props}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </Icon>
)

/** Upload */
export const UploadIcon = (props: IconProps) => (
  <Icon strokeWidth={2.2} {...props}>
    <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
  </Icon>
)

/** A resume file */
export const DocumentIcon = (props: IconProps) => (
  <Icon strokeWidth={1.6} {...props}>
    <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v5h5M12 11v6M9.5 13.5L12 11l2.5 2.5" />
  </Icon>
)

/** Language */
export const GlobeIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
  </Icon>
)

/** A menu that opens a list of choices */
export const ChevronUpDownIcon = (props: IconProps) => (
  <Icon strokeWidth={2.2} {...props}>
    <path d="M8 9.5l4-4 4 4M8 14.5l4 4 4-4" />
  </Icon>
)
