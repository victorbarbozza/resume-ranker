import type { ICandidateProfile } from '@/server/shared/schemas/candidate.schema'
import type { Area } from '@/shared/areas'
import { i18n } from '@/web/i18n'

/** An area as people read it, in the screen's language */
export const areaLabel = (area: Area): string => i18n.t(`areas.${area}`)

/** Several items joined the way the language lists them: `Data and Design`, `Dados e Design` */
export const listOf = (items: string[]): string =>
  new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(items)

/** Steps from seconds up to years, each with how many of the step before it fit */
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Infinity],
]

/** How long ago an ISO date was, such as `2 hours ago` or `há 2 horas`; under a minute is `just now` */
export const timeAgo = (iso: string): string => {
  const relative = new Intl.RelativeTimeFormat(i18n.language, {
    numeric: 'auto',
  })
  let amount = (new Date(iso).getTime() - Date.now()) / 1000
  if (Math.abs(amount) < 60) return i18n.t('common.justNow')
  for (const [unit, size] of STEPS) {
    if (Math.abs(amount) < size)
      return relative.format(Math.round(amount), unit)
    amount /= size
  }
  return relative.format(Math.round(amount), 'year')
}

/** A file size in KB or MB in the screen's language, such as `184 KB` or `1,1 MB` */
export const fileSize = (bytes: number): string => {
  const number = new Intl.NumberFormat(i18n.language, {
    maximumFractionDigits: 1,
  })
  return bytes < 1024 * 1024
    ? `${number.format(Math.ceil(bytes / 1024))} KB`
    : `${number.format(bytes / 1024 / 1024)} MB`
}

/** A whole number in the screen's language, such as `1,248` or `1.248` */
export const formatNumber = (value: number): string =>
  new Intl.NumberFormat(i18n.language).format(value)

/** What a candidate is called: the name read from the resume, or the file name until there is one */
export const displayName = (candidate: {
  name: string | null
  fileName: string
}): string => candidate.name || candidate.fileName

/** Seniority and years, such as `Senior, 8 years`; empty until the resume is read */
export const profileLine = (profile: ICandidateProfile | null): string => {
  if (!profile) return ''
  const years =
    profile.yearsOfExperience < 1
      ? i18n.t('common.lessThanAYear')
      : i18n.t('common.years', { count: Math.round(profile.yearsOfExperience) })
  return `${i18n.t(`seniority.${profile.seniority}`)}, ${years}`
}
