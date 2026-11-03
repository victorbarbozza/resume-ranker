import { type Static, Type } from 'typebox'

import { VERDICTS } from '@/server/shared/schemas/evaluation.schema'

import { RESUME_PROMPT_MAX_CHARS } from './candidate-extract-profile'
import { dataBlock, type PromptDefinition, systemMessage } from './prompt'

/**
 * What the candidates.evaluate prompt reads: one job, the requirements the
 * LLM judges, each with the id the code gave it, and one whole resume.
 */
export type EvaluateInput = {
  job: { title: string; description: string }
  requirements: { id: string; text: string }[]
  resumeText: string
}

/**
 * The verdict on each requirement, with the quote it rests on. There is no
 * score: the code computes it from the verdicts. The evidence comes before
 * the verdict, and the summary last, so each conclusion follows its reading.
 */
export const assessmentsSchema = Type.Object(
  {
    assessments: Type.Array(
      Type.Object(
        {
          requirementId: Type.String({
            description: 'The id from the requirement tag',
          }),
          evidence: Type.Union([Type.String(), Type.Null()], {
            description:
              'The passage of the resume that shows the requirement, copied word for word; null when the resume does not show it',
          }),
          verdict: Type.Enum(VERDICTS, {
            description:
              'met when the resume shows the requirement, partial when it shows something close, missing when it does not',
          }),
        },
        { additionalProperties: false }
      )
    ),
    summary: Type.String({
      description: 'One or two sentences on how the candidate fits the job',
    }),
  },
  { additionalProperties: false }
)

/** The verdicts on one resume, as the LLM answers them */
export type Assessments = Static<typeof assessmentsSchema>

/** The requirements as tags, each with the id the answer must repeat */
const requirementTags = (requirements: EvaluateInput['requirements']) =>
  requirements
    .map(({ id, text }) => dataBlock('requirement', text, ` id="${id}"`))
    .join('\n')

/** Checks one resume against the requirements of one job, one verdict each */
export const evaluatePrompt: PromptDefinition<
  EvaluateInput,
  typeof assessmentsSchema
> = {
  version: 'candidates-evaluate@3',
  system: systemMessage({
    role: 'You check one resume against the requirements of one job for a recruiting team. The code turns your verdicts into the score and shows the recruiter each quote next to its requirement, so every verdict must rest on a passage the recruiter can find in the resume.',
    instructions: [
      'Judge each requirement on its own against the resume, with no weights and no score: the code computes the score.',
      'For each requirement, copy as evidence the passage of the resume that shows it, word for word, up to 300 characters, in the language of the resume. A passage that is not in the resume makes the requirement count as missing.',
      'Use met when the resume shows the requirement, partial when it shows something close, such as a similar tool or fewer years than asked, and missing when it does not show it, with evidence null.',
      'Leave out the name, age, gender, photo and address of the candidate, so a verdict never depends on who the candidate is.',
      'Return exactly one assessment per requirement, with the id from its tag.',
      'Write the summary in one or two sentences in Brazilian Portuguese, keeping the names of technologies as the job and the resume write them.',
    ],
  }),
  schema: assessmentsSchema,
  data: ({ job, requirements, resumeText }) => {
    const cut = resumeText.length > RESUME_PROMPT_MAX_CHARS
    const text = cut ? resumeText.slice(0, RESUME_PROMPT_MAX_CHARS) : resumeText
    const note = cut
      ? `\nThe resume was cut at ${RESUME_PROMPT_MAX_CHARS} characters.`
      : ''
    return [
      dataBlock('job', `Title: ${job.title}\nDescription:\n${job.description}`),
      `<requirements>\n${requirementTags(requirements)}\n</requirements>`,
      `${dataBlock('resume', text)}${note}`,
    ].join('\n\n')
  },
  task: 'Assess every requirement above against the resume.',
  fake: ({ requirements }) => ({
    assessments: requirements.map(({ id }) => ({
      requirementId: id,
      evidence: null,
      verdict: 'missing',
    })),
    summary: 'Placeholder from the fake model: set LLM_MODEL to rank for real.',
  }),
}
