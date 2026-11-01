import { type Static, Type } from 'typebox'

import {
  CANDIDATE_NAME_MAX_LENGTH,
  candidateProfileSchema,
} from '@/server/shared/schemas/candidate.schema'
import { AREAS } from '@/shared/areas'

import { dataBlock, type PromptDefinition, systemMessage } from './prompt'

/** Longest resume text sent to the LLM; the stored text stays whole */
export const RESUME_PROMPT_MAX_CHARS = 30_000

/**
 * What the LLM extracts from one resume.
 *
 * - `name`: null when the resume has none
 * - `areas`: one or two, most relevant first
 */
export const extractedProfileSchema = Type.Object(
  {
    name: Type.Union(
      [Type.String({ maxLength: CANDIDATE_NAME_MAX_LENGTH }), Type.Null()],
      { description: 'Full name as the resume writes it' }
    ),
    areas: Type.Array(Type.Enum(AREAS), {
      minItems: 1,
      maxItems: 2,
      description: 'Areas that fit the experience best, most relevant first',
    }),
    profile: candidateProfileSchema,
  },
  { additionalProperties: false }
)

/** A profile as the LLM extracts it, with the name and areas */
export type ExtractedProfile = Static<typeof extractedProfileSchema>

/**
 * What the candidate.extract_profile prompt reads.
 *
 * - `today`: the date years of experience run to, as YYYY-MM-DD
 */
export type CandidateProfileInput = { resumeText: string; today: string }

/** Turns a resume into the profile that rankings read */
export const candidateProfilePrompt: PromptDefinition<
  CandidateProfileInput,
  typeof extractedProfileSchema
> = {
  version: 'candidate-profile@1',
  system: systemMessage({
    role: 'You read resumes for a recruiting team and turn each one into a short profile. Rankings read only this profile, never the resume, so a skill or fact you leave out can never count for the candidate.',
    instructions: [
      "Set name to the candidate's full name as written, or null when the resume shows none.",
      'Pick one or two areas that fit the experience best, most relevant first.',
      'List every technology, tool and practice the resume shows, up to 30, with canonical names such as PostgreSQL or Node.js, so they match the names jobs use.',
      'Count years of experience from the dates of paid work: overlapping jobs count once, a current job runs until today, and studies do not count. Use 0 when the resume has no work history.',
      'Pick the seniority from the definitions below.',
      'Write the summary in three to five sentences of concrete facts: domains, scale, projects and results. Leave out the name, age, gender, photo and address, so a score never depends on who the candidate is.',
      'Write in English, whatever the language of the resume.',
      'Use only what the resume states, and leave out what it does not say, because the recruiter trusts every item.',
    ],
    sections: [
      {
        title: 'Seniority',
        lines: [
          'intern: a student, or internships only',
          'junior: under 2 years of professional work',
          'mid: 2 to 5 years, working on their own',
          'senior: over 5 years, or owns the design of systems',
          'lead: leads people or the technical direction of a team',
        ],
      },
    ],
  }),
  schema: extractedProfileSchema,
  data: ({ resumeText, today }) => {
    const cut = resumeText.length > RESUME_PROMPT_MAX_CHARS
    const text = cut ? resumeText.slice(0, RESUME_PROMPT_MAX_CHARS) : resumeText
    const note = cut
      ? `\nThe resume was cut at ${RESUME_PROMPT_MAX_CHARS} characters.`
      : ''
    return `Today: ${today}\n\n${dataBlock('resume', text)}${note}`
  },
  task: 'Turn the resume above into a profile.',
}
