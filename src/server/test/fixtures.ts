import { randomBytes } from 'node:crypto'

import { uploadResumes } from '@/server/domains/candidates/services/upload-resumes'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import type {
  ICandidate,
  ICandidateProfile,
} from '@/server/shared/schemas/candidate.schema'
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
export const createCandidate = async (
  overrides: Partial<candidatesRepo.CreateCandidateInput> = {}
): Promise<ICandidate> => {
  const candidate = await candidatesRepo.create({
    fileName: 'resume.pdf',
    contentHash: randomHash(),
    ...overrides,
  })
  if (!candidate) throw new Error('a live candidate already has this file')
  return candidate
}

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

/** A candidate whose profile is extracted, so a ranking can pick it up */
export const createReadyCandidate = async (input: {
  skills?: string[]
  summary?: string
  areas?: Area[]
}): Promise<string> => {
  const candidate = await createCandidate()
  await candidatesRepo.saveProfile(candidate.id, {
    name: null,
    profile: profileWith(input.skills ?? [], input.summary),
    areas: input.areas ?? ['engineering'],
    generatedBy,
  })
  return candidate.id
}

/** A pending candidate sent through the real upload, so its file is stored and its profile queued; returns its id */
export const uploadResume = async (
  bytes: Uint8Array,
  name = 'resume.pdf'
): Promise<string> => {
  const [result] = await uploadResumes([
    { name, type: '', bytes: new Uint8Array(bytes) },
  ])
  if (result.status === 'rejected') throw new Error(result.error)
  return result.candidateId
}
