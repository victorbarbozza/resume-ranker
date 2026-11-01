import { jobRequirementsSchema } from '@/server/shared/schemas/job.schema'
import type { Area } from '@/shared/areas'

import { dataBlock, type PromptDefinition, systemMessage } from './prompt'

/** What the job.analyze prompt reads */
export type JobAnalyzeInput = {
  title: string
  description: string
  area: Area
}

/** Reads the must-have and nice-to-have requirements out of a job opening */
export const jobAnalyzePrompt: PromptDefinition<
  JobAnalyzeInput,
  typeof jobRequirementsSchema
> = {
  version: 'job-analyze@1',
  system: systemMessage({
    role: 'You read job openings for a recruiting team and list what each job requires. Every candidate is later scored against your list, so a nice-to-have listed as a must-have lowers every score.',
    instructions: [
      'Put in mustHave what the job states as required: items under requirements, or phrased with must, required or need.',
      'Put in niceToHave what the job marks as a plus, preferred or desirable.',
      'Count a seniority stated in the title, such as Senior, as a must-have, written as the title states it.',
      'Write one requirement per item: "Node.js and PostgreSQL" becomes two items.',
      'Keep only what the job states, and return an empty list when it states none of a kind, because an invented requirement would cost candidates points.',
      'Write in English, with canonical names such as PostgreSQL and Node.js, so jobs and resumes use the same words.',
    ],
  }),
  schema: jobRequirementsSchema,
  data: ({ title, area, description }) =>
    dataBlock(
      'job',
      `Title: ${title}\nArea: ${area}\nDescription:\n${description}`
    ),
  task: 'List the requirements of the job above.',
}
