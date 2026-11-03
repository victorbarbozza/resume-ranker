import { randomBytes } from 'node:crypto'

import { createSession } from '@/server/domains/auth/services/sessions'
import { uploadResumes } from '@/server/domains/candidates/services/upload-resumes'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import * as usersRepo from '@/server/shared/database/repositories/users'
import type {
  ICandidate,
  ICandidateProfile,
} from '@/server/shared/schemas/candidate.schema'
import type { IGeneratedBy } from '@/server/shared/schemas/generated-by.schema'
import type { IJobRequirements } from '@/server/shared/schemas/job.schema'
import type { IUser } from '@/server/shared/schemas/user.schema'
import type { Area } from '@/shared/areas'

/** A random hex string shaped like a sha256 file hash */
export const randomHash = () => randomBytes(32).toString('hex')

/** The model and prompt version that fixtures store */
export const generatedBy: IGeneratedBy = {
  model: 'fake',
  promptVersion: 'test-1',
}

/**
 * A user with a unique name; the password hash is a placeholder unless one is
 * given, so tests that never log in skip scrypt
 */
export const createUser = async (
  passwordHash = 'scrypt$placeholder'
): Promise<IUser> => {
  const user = await usersRepo.create({
    username: `user-${randomHash().slice(0, 8)}`,
    passwordHash,
  })
  if (!user) throw new Error('the username is taken')
  return user
}

/**
 * Headers of a signed-in browser on the app's own page: the cookie of a new
 * session and the Origin the CSRF check expects
 */
export const signedInHeaders = async (): Promise<Record<string, string>> => {
  const user = await createUser()
  const token = await createSession(user.id, null)
  return { Cookie: `session=${token}`, Origin: 'http://localhost' }
}

/** Job requirements: primary must-haves, the nice-to-haves and the experience asked, none unless given */
export const requirementsWith = (
  mustHave: string[],
  niceToHave: string[] = [],
  experience: IJobRequirements['experience'] = {
    minYears: null,
    seniority: null,
  }
): IJobRequirements => ({
  mustHave: mustHave.map((text) => ({ text, importance: 'primary' })),
  niceToHave,
  experience,
})

/** An engineering job analysed into the requirements, at version 1 */
export const createAnalyzedJob = async (
  requirements: IJobRequirements = requirementsWith(['Node.js'])
) => {
  const job = await createJob()
  await jobsRepo.saveAnalysis(job.id, 1, requirements, generatedBy)
  return job
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

/** The resume text ready candidates have unless a test gives its own */
export const RESUME_TEXT =
  'Engenheira de backend. Node.js e PostgreSQL desde 2018, APIs de pagamento.'

/** A candidate whose text and profile are extracted, so a ranking can pick it up */
export const createReadyCandidate = async (input: {
  name?: string
  skills?: string[]
  summary?: string
  areas?: Area[]
  resumeText?: string
}): Promise<string> => {
  const candidate = await createCandidate()
  await candidatesRepo.saveResumeText(
    candidate.id,
    input.resumeText ?? RESUME_TEXT
  )
  await candidatesRepo.saveProfile(candidate.id, {
    name: input.name ?? null,
    profile: profileWith(input.skills ?? [], input.summary),
    areas: input.areas ?? ['engineering'],
    generatedBy,
  })
  return candidate.id
}

/** A pending candidate sent through the real upload, so its file is stored and its profile queued; returns its id */
export const uploadResume = async (
  bytes: Uint8Array<ArrayBuffer>,
  name = 'resume.pdf'
): Promise<string> => {
  const [result] = await uploadResumes([new File([bytes], name)])
  if (result.status === 'rejected') throw new Error(result.error)
  return result.candidateId
}
