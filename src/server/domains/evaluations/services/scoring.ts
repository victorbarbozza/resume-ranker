import {
  type ICandidateProfile,
  SENIORITIES,
} from '@/server/shared/schemas/candidate.schema'
import type {
  CriterionGroup,
  IAssessment,
  Verdict,
} from '@/server/shared/schemas/evaluation.schema'
import type { IJobRequirements } from '@/server/shared/schemas/job.schema'

/**
 * The rules of the score, in one place.
 *
 * - `groups`: each group's share of the score when the job has both; a group alone takes it all
 * - `importance`: the weight of a must-have, by how central it is to the job
 * - `niceToHaveWeight`: every nice-to-have weighs the same
 * - `verdicts`: how much of its weight each verdict earns
 * - `experience`: the weight of the experience criterion, and the share of the years asked that still counts as partial
 */
export const SCORING = {
  groups: { mustHave: 0.8, niceToHave: 0.2 },
  importance: { primary: 2, secondary: 1 },
  niceToHaveWeight: 1,
  verdicts: { met: 1, partial: 0.5, missing: 0 },
  experience: { weight: 2, partialShare: 0.7 },
} as const

/**
 * One thing a candidate is measured against.
 *
 * - `id`: `m1`, `m2`… for must-haves and `n1`… for nice-to-haves, which the LLM judges; `experience`, which the code judges
 * - `requirement`: the text the LLM judges; null for the experience criterion
 */
export type Criterion = {
  id: string
  group: CriterionGroup
  weight: number
  requirement: string | null
}

/** Id of the experience criterion, the one the code judges */
export const EXPERIENCE_CRITERION = 'experience'

/** The experience the job asks for, as one more must-have */
const experienceCriterion: Criterion = {
  id: EXPERIENCE_CRITERION,
  group: 'mustHave',
  weight: SCORING.experience.weight,
  requirement: null,
}

/**
 * The criteria of a job: its must-haves, then the experience it asks for, if
 * any, as one more must-have, then its nice-to-haves.
 */
export const criteriaOf = (requirements: IJobRequirements): Criterion[] => {
  const { mustHave, niceToHave, experience } = requirements
  const asksExperience =
    experience.minYears !== null || experience.seniority !== null
  return [
    ...mustHave.map((item, index): Criterion => ({
      id: `m${index + 1}`,
      group: 'mustHave',
      weight: SCORING.importance[item.importance],
      requirement: item.text,
    })),
    ...(asksExperience ? [experienceCriterion] : []),
    ...niceToHave.map((text, index): Criterion => ({
      id: `n${index + 1}`,
      group: 'niceToHave',
      weight: SCORING.niceToHaveWeight,
      requirement: text,
    })),
  ]
}

/**
 * How the profile measures up to the experience the job asks for. The years
 * decide when the job states them: all of them is met, at least 70% is
 * partial. Otherwise the career level decides: the same or higher is met,
 * one level below is partial.
 */
export const experienceVerdict = (
  asked: IJobRequirements['experience'],
  profile: ICandidateProfile
): Verdict => {
  if (asked.minYears !== null) {
    if (profile.yearsOfExperience >= asked.minYears) return 'met'
    return profile.yearsOfExperience >=
      asked.minYears * SCORING.experience.partialShare
      ? 'partial'
      : 'missing'
  }
  if (asked.seniority === null) return 'met'
  const gap =
    SENIORITIES.indexOf(asked.seniority) -
    SENIORITIES.indexOf(profile.seniority)
  return gap <= 0 ? 'met' : gap === 1 ? 'partial' : 'missing'
}

/** Text reduced to its letters and digits, in lower case, so a quote matches the resume across line breaks, accents and punctuation */
const comparable = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')

/** Whether the quote is in the resume, ignoring case, spacing, accents and punctuation */
export const quotedFrom = (quote: string, resumeText: string): boolean => {
  const needle = comparable(quote)
  return needle.length > 0 && comparable(resumeText).includes(needle)
}

/**
 * The score from 0 to 100: in each group, the weight each criterion earns by
 * its verdict over the group's whole weight; then the groups by their share,
 * and a group alone takes the whole score.
 */
export const scoreOf = (assessments: IAssessment[]): number => {
  const groups = Object.entries(SCORING.groups).flatMap(([group, share]) => {
    const members = assessments.filter((item) => item.group === group)
    const total = members.reduce((sum, item) => sum + item.weight, 0)
    if (total === 0) return []
    const earned = members.reduce(
      (sum, item) => sum + item.weight * SCORING.verdicts[item.verdict],
      0
    )
    return [{ share, ratio: earned / total }]
  })
  const shares = groups.reduce((sum, group) => sum + group.share, 0)
  if (shares === 0) return 0
  const score = groups.reduce(
    (sum, group) => sum + (group.share / shares) * group.ratio,
    0
  )
  return Math.round(score * 100)
}
