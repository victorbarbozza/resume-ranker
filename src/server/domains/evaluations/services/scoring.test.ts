import { describe, expect, test } from 'bun:test'

import type { IAssessment } from '@/server/shared/schemas/evaluation.schema'
import type { IJobRequirements } from '@/server/shared/schemas/job.schema'
import { profileWith } from '@/server/test/fixtures'

import { criteriaOf, experienceVerdict, quotedFrom, scoreOf } from './scoring'

/** An assessment with only what the score reads */
const assessment = (
  group: IAssessment['group'],
  weight: number,
  verdict: IAssessment['verdict']
): IAssessment => ({
  criterion: 'm1',
  group,
  weight,
  requirement: 'Node.js',
  verdict,
  evidence: null,
  evidenceNotFound: false,
  experience: null,
})

describe('criteriaOf', () => {
  test('numbers the must-haves, adds the experience asked and the nice-to-haves', () => {
    const criteria = criteriaOf({
      mustHave: [
        { text: 'Node.js', importance: 'primary' },
        { text: 'AWS', importance: 'secondary' },
      ],
      niceToHave: ['Docker'],
      experience: { minYears: 5, seniority: null },
    })

    expect(criteria).toEqual([
      { id: 'm1', group: 'mustHave', weight: 2, requirement: 'Node.js' },
      { id: 'm2', group: 'mustHave', weight: 1, requirement: 'AWS' },
      { id: 'experience', group: 'mustHave', weight: 2, requirement: null },
      { id: 'n1', group: 'niceToHave', weight: 1, requirement: 'Docker' },
    ])
  })

  test('leaves the experience out when the job asks none', () => {
    const criteria = criteriaOf({
      mustHave: [],
      niceToHave: [],
      experience: { minYears: null, seniority: null },
    })

    expect(criteria).toEqual([])
  })
})

describe('experienceVerdict', () => {
  const profile = (years: number, seniority: 'junior' | 'mid' | 'senior') => ({
    ...profileWith([]),
    yearsOfExperience: years,
    seniority,
  })

  test('the years decide when the job states them', () => {
    const asked: IJobRequirements['experience'] = {
      minYears: 5,
      seniority: 'senior',
    }

    expect(experienceVerdict(asked, profile(5, 'mid'))).toBe('met')
    expect(experienceVerdict(asked, profile(3.5, 'senior'))).toBe('partial')
    expect(experienceVerdict(asked, profile(3, 'senior'))).toBe('missing')
  })

  test('the level decides when the job names only a level', () => {
    const asked: IJobRequirements['experience'] = {
      minYears: null,
      seniority: 'senior',
    }

    expect(experienceVerdict(asked, profile(1, 'senior'))).toBe('met')
    expect(experienceVerdict(asked, profile(1, 'mid'))).toBe('partial')
    expect(experienceVerdict(asked, profile(1, 'junior'))).toBe('missing')
  })
})

describe('scoreOf', () => {
  test('weighs the must-haves 80% and the nice-to-haves 20%', () => {
    const score = scoreOf([
      assessment('mustHave', 2, 'met'),
      assessment('mustHave', 2, 'met'),
      assessment('mustHave', 1, 'partial'),
      assessment('mustHave', 2, 'partial'),
      assessment('niceToHave', 1, 'missing'),
    ])

    expect(score).toBe(63)
  })

  test('gives a group alone the whole score', () => {
    expect(scoreOf([assessment('mustHave', 2, 'met')])).toBe(100)
    expect(scoreOf([assessment('niceToHave', 1, 'partial')])).toBe(50)
  })

  test('is 0 with nothing to score', () => {
    expect(scoreOf([])).toBe(0)
  })
})

describe('quotedFrom', () => {
  const resume =
    'Engenheira de software.\nNode.js e PostgreSQL desde 2018 —\nAPIs de pagamento.'

  test('finds a quote across case, line breaks, accents and punctuation', () => {
    expect(quotedFrom('node.js e postgresql desde 2018', resume)).toBe(true)
    expect(quotedFrom('Engenheira de Software', resume)).toBe(true)
    expect(quotedFrom('desde 2018 APIs de pagamento', resume)).toBe(true)
  })

  test('refuses a quote the resume does not have', () => {
    expect(quotedFrom('Kubernetes em produção', resume)).toBe(false)
    expect(quotedFrom('...', resume)).toBe(false)
  })
})
