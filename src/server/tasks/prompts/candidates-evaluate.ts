import { Type } from 'typebox'

import type { ICandidateProfile } from '@/server/shared/schemas/candidate.schema'
import type { IJobRequirements } from '@/server/shared/schemas/job.schema'

import { dataBlock, type PromptDefinition, systemMessage } from './prompt'

/** The job a batch is scored against */
export type EvaluateJob = {
  title: string
  description: string
  requirements: IJobRequirements
}

/** One candidate of a batch: the profile only, without the name, so the score never sees who it is */
export type EvaluateCandidate = { id: string; profile: ICandidateProfile }

/** What the candidates.evaluate prompt reads: one job and a batch of candidates */
export type EvaluateInput = {
  job: EvaluateJob
  candidates: EvaluateCandidate[]
}

/**
 * The verdicts of one batch. The score comes last, so it is written after the
 * evidence. The handler checks that every candidate sent has one result.
 */
export const evaluationBatchSchema = Type.Object(
  {
    results: Type.Array(
      Type.Object(
        {
          candidateId: Type.String({
            description: 'The id from the candidate tag',
          }),
          strengths: Type.Array(Type.String(), {
            description:
              'Requirements the profile meets, each with its evidence from the profile',
          }),
          gaps: Type.Array(Type.String(), {
            description: 'Requirements the profile does not show',
          }),
          summary: Type.String({
            description: 'One or two sentences on how the candidate fits',
          }),
          score: Type.Integer({
            minimum: 0,
            maximum: 100,
            description: 'Points from the rubric',
          }),
        },
        { additionalProperties: false }
      )
    ),
  },
  { additionalProperties: false }
)

/** A list as prompt lines, or a note that it is empty */
const bulletList = (items: string[]) =>
  items.length > 0
    ? items.map((item) => `- ${item}`).join('\n')
    : '- none listed'

/** The job as prompt lines */
const describeJob = ({ title, description, requirements }: EvaluateJob) =>
  `Title: ${title}
Must have:
${bulletList(requirements.mustHave)}
Nice to have:
${bulletList(requirements.niceToHave)}
Description:
${description}`

/** One profile as prompt lines, without the name */
const describeProfile = (profile: ICandidateProfile) =>
  `Seniority: ${profile.seniority}, ${profile.yearsOfExperience} years of experience
Skills: ${profile.skills.join(', ')}
Languages: ${profile.languages.join(', ')}
Summary: ${profile.summary}`

/** Scores a batch of candidates against one job with a fixed rubric */
export const evaluatePrompt: PromptDefinition<
  EvaluateInput,
  typeof evaluationBatchSchema
> = {
  version: 'candidates-evaluate@1',
  system: systemMessage({
    role: 'You score candidates for one job opening for a recruiting team. A recruiter compares scores across many batches and reads every strength before choosing who to interview, so each score must follow the rubric on its own and every strength must point to the profile.',
    instructions: [
      'Score each candidate on its own against the job, never against the other candidates in the batch.',
      'List as strengths the requirements the profile meets, each with its evidence from the profile, such as "Node.js: 6 years building payment APIs".',
      'List as gaps the requirements the profile does not show.',
      'Write the summary in one or two sentences on how the candidate fits the job.',
      'Add up the score last, from the strengths and gaps.',
      'Return exactly one result per candidate, with the id from its tag.',
      'Write in English.',
    ],
    sections: [
      {
        title: 'Rubric (0 to 100)',
        lines: [
          'Must-haves: up to 60 points, split evenly among them. A requirement earns its full share when the profile shows it, and half when the profile shows something close, such as a similar tool or fewer years.',
          'Nice-to-haves: up to 20 points, split evenly among them, with the same half rule.',
          'Seniority and years of experience against what the job asks: up to 20 points.',
          'When the job lists no requirements of a kind, give those points by how well the profile matches the job description.',
        ],
      },
    ],
  }),
  schema: evaluationBatchSchema,
  data: ({ job, candidates }) => {
    const blocks = candidates.map(({ id, profile }) =>
      dataBlock('candidate', describeProfile(profile), ` id="${id}"`)
    )
    return `${dataBlock('job', describeJob(job))}\n\n<candidates>\n${blocks.join('\n')}\n</candidates>`
  },
  task: 'Score every candidate above against the job.',
}
