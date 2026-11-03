import { useTranslation } from 'react-i18next'

import type {
  CriterionGroup,
  IAssessment,
} from '@/server/shared/schemas/evaluation.schema'
import { i18n } from '@/web/i18n'
import { experienceAsked } from '@/web/lib/format'

import styles from './evaluations.module.css'

/** What a criterion asks, as people read it: the requirement, or the experience the job asks for */
export const criterionLabel = (assessment: IAssessment): string =>
  assessment.requirement ??
  (assessment.experience
    ? experienceAsked(assessment.experience)
    : i18n.t('ranking.experience'))

/** Must-haves before nice-to-haves, then the heaviest first */
const byWeight = (a: IAssessment, b: IAssessment) =>
  Number(a.group === 'niceToHave') - Number(b.group === 'niceToHave') ||
  b.weight - a.weight

/** The criteria the candidate meets or partly meets, fully met and heaviest first */
export const strengthsOf = (assessments: IAssessment[]) =>
  assessments
    .filter((item) => item.verdict !== 'missing')
    .sort(
      (a, b) =>
        Number(a.verdict === 'partial') - Number(b.verdict === 'partial') ||
        byWeight(a, b)
    )

/** The criteria the candidate does not show, must-haves and heaviest first */
export const gapsOf = (assessments: IAssessment[]) =>
  assessments.filter((item) => item.verdict === 'missing').sort(byWeight)

/** The name of each verdict, by its key in the ranking texts */
const VERDICT_LABELS = {
  met: 'ranking.verdictMet',
  partial: 'ranking.verdictPartial',
  missing: 'ranking.verdictMissing',
} as const

/** The weight of a must-have as people read it; nice-to-haves all weigh the same */
const weightLabel = (assessment: IAssessment) => {
  if (assessment.group === 'niceToHave') return null
  return assessment.weight > 1
    ? i18n.t('common.primary')
    : i18n.t('common.secondary')
}

/** One criterion: the verdict, what it asks, its weight, and the passage or the fact behind the verdict */
function Criterion({ assessment }: { assessment: IAssessment }) {
  const { t } = useTranslation()
  const weight = weightLabel(assessment)
  const { experience, evidence, evidenceNotFound } = assessment

  return (
    <li className={styles.criterion}>
      <span className={`${styles.verdict} ${styles[assessment.verdict]}`}>
        {t(VERDICT_LABELS[assessment.verdict])}
      </span>
      <span className={styles.criterionBody}>
        <span className={styles.criterionHead}>
          <span className={styles.criterionText}>
            {criterionLabel(assessment)}
          </span>
          {weight && <span className={styles.weight}>{weight}</span>}
        </span>
        {experience && (
          <span className={styles.fact}>
            {t('ranking.hasExperience', {
              count: Math.round(experience.years),
              level: t(`seniority.${experience.candidateSeniority}`),
            })}
          </span>
        )}
        {evidence && evidenceNotFound && (
          <span className={styles.fact}>{t('ranking.evidenceNotFound')}</span>
        )}
        {evidence && (
          <q
            className={`${styles.evidence} ${evidenceNotFound ? styles.unfounded : ''}`}
          >
            {evidence}
          </q>
        )}
      </span>
    </li>
  )
}

/** The title of each group of criteria, by its key in the job texts */
const GROUP_TITLES = {
  mustHave: 'jobs.mustHave',
  niceToHave: 'jobs.niceToHave',
} as const

/**
 * Every criterion of a result, must-haves then nice-to-haves, each with its
 * verdict and the quote from the resume or the fact from the profile behind
 * it. The score is computed from these verdicts.
 */
export function AssessmentList({
  assessments,
}: {
  assessments: IAssessment[]
}) {
  const { t } = useTranslation()
  const groups: CriterionGroup[] = ['mustHave', 'niceToHave']

  return (
    <div className={styles.criteria}>
      {groups.map((group) => {
        const items = assessments.filter((item) => item.group === group)
        if (items.length === 0) return null
        return (
          <section key={group} className={styles.criteriaGroup}>
            <h4 className={styles.label}>{t(GROUP_TITLES[group])}</h4>
            <ul className={styles.criteriaList}>
              {items.map((assessment) => (
                <Criterion key={assessment.criterion} assessment={assessment} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
