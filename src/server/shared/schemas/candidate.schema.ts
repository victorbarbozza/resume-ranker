import { type Static, Type } from 'typebox'

import { generatedBySchema } from '@/server/shared/schemas/generated-by.schema'
import { AREAS } from '@/shared/areas'

/** Lifecycle of a candidate: pending until the profile is extracted, then ready or failed */
export const CANDIDATE_STATUSES = ['pending', 'ready', 'failed'] as const
/** One of CANDIDATE_STATUSES */
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number]

/** Seniority levels the LLM picks from */
export const SENIORITIES = [
  'intern',
  'junior',
  'mid',
  'senior',
  'lead',
] as const
/** One of SENIORITIES */
export type Seniority = (typeof SENIORITIES)[number]

/** Longest candidate name stored */
export const CANDIDATE_NAME_MAX_LENGTH = 200
/** Longest file name stored */
export const FILE_NAME_MAX_LENGTH = 255
/** Largest resume file accepted: 5 MB */
export const RESUME_FILE_MAX_BYTES = 5 * 1024 * 1024

/** What the LLM extracts from a resume once; rankings read this, not the full text */
export const candidateProfileSchema = Type.Object({
  skills: Type.Array(Type.String()),
  yearsOfExperience: Type.Number({ minimum: 0 }),
  seniority: Type.Enum(SENIORITIES),
  languages: Type.Array(Type.String()),
  summary: Type.String(),
})

/** A profile as the LLM extracts it */
export type ICandidateProfile = Static<typeof candidateProfileSchema>

/**
 * A candidate as the API returns it, without the resume text, which only the LLM tasks read.
 *
 * - `name`: read from the resume by the LLM; null until the profile is extracted
 * - `areas`: empty until the profile is extracted
 */
export const candidateSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.Union([
    Type.String({ maxLength: CANDIDATE_NAME_MAX_LENGTH }),
    Type.Null(),
  ]),
  fileName: Type.String({ maxLength: FILE_NAME_MAX_LENGTH }),
  contentHash: Type.String({ pattern: '^[0-9a-f]{64}$' }),
  profile: Type.Union([candidateProfileSchema, Type.Null()]),
  profileGeneratedBy: Type.Union([generatedBySchema, Type.Null()]),
  areas: Type.Array(Type.Enum(AREAS)),
  status: Type.Enum(CANDIDATE_STATUSES),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

/** A candidate as the API returns it */
export type ICandidate = Static<typeof candidateSchema>
