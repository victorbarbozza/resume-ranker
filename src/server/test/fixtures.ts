import { randomBytes } from 'node:crypto'

import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import type { ICandidateProfile } from '@/server/shared/schemas/candidate.schema'
import type { IGeneratedBy } from '@/server/shared/schemas/generated-by.schema'
import type { Area } from '@/shared/areas'

/** A random hex string shaped like a sha256 file hash */
export const randomHash = () => randomBytes(32).toString('hex')

/** The model and prompt version that fixtures store */
export const generatedBy: IGeneratedBy = {
  model: 'fake',
  promptVersion: 'test-1',
}

/** A pending engineering job; override any field */
export const createJob = (overrides: Partial<jobsRepo.CreateJobInput> = {}) =>
  jobsRepo.create({
    title: 'Backend Engineer',
    description: 'Node.js services, Postgres and queues.',
    area: 'engineering',
    ...overrides,
  })

/** A pending candidate with a unique file hash; override any field */
export const createCandidate = (
  overrides: Partial<candidatesRepo.CreateCandidateInput> = {}
) =>
  candidatesRepo.create({
    fileName: 'resume.pdf',
    contentHash: randomHash(),
    resumeText: 'Backend engineer with 8 years of Node.js.',
    ...overrides,
  })

/** A profile with the given skills and summary */
export const profileWith = (
  skills: string[],
  summary = 'Summary written for a test.'
): ICandidateProfile => ({
  skills,
  yearsOfExperience: 5,
  seniority: 'mid',
  languages: ['English'],
  summary,
})

/** A candidate whose profile is extracted, so it can enter a shortlist */
export const createReadyCandidate = async (input: {
  skills?: string[]
  summary?: string
  resumeText?: string
  areas?: Area[]
}): Promise<string> => {
  const candidate = await createCandidate({
    resumeText: input.resumeText ?? 'No further details.',
  })
  await candidatesRepo.saveProfile(candidate.id, {
    name: null,
    profile: profileWith(input.skills ?? [], input.summary),
    areas: input.areas ?? ['engineering'],
    generatedBy,
  })
  return candidate.id
}
