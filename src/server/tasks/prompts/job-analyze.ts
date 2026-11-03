import { jobRequirementsSchema } from '@/server/shared/schemas/job.schema'
import type { Area } from '@/shared/areas'

import {
  dataBlock,
  type PromptDefinition,
  SENIORITY_SECTION,
  systemMessage,
} from './prompt'

/** What the job.analyze prompt reads */
export type JobAnalyzeInput = {
  title: string
  description: string
  area: Area
}

/**
 * Reads the requirements out of a job opening: the must-haves, each marked
 * primary or secondary, the nice-to-haves, and the general experience it
 * asks for. The fake model answers one placeholder must-have, so a job can be
 * ranked without a key.
 */
export const jobAnalyzePrompt: PromptDefinition<
  JobAnalyzeInput,
  typeof jobRequirementsSchema
> = {
  version: 'job-analyze@3',
  system: systemMessage({
    role: 'You read job openings for a recruiting team and list what each job requires. Every candidate is later checked against your list, one requirement at a time, and the score weighs primary must-haves twice as much as secondary ones, so a requirement in the wrong list or with the wrong weight moves every score.',
    instructions: [
      'Put in mustHave what the job states as required: items under requirements, or phrased with must, required or need.',
      'Mark a must-have as primary when the job centres on it, such as the main stack in the title or the first requirements it lists, and as secondary otherwise.',
      'Put in niceToHave what the job marks as a plus, preferred or desirable.',
      'Put the general experience the job asks for in experience, not in the lists: the total years of professional work as minYears, and a career level, such as Senior in the title, as seniority, from the levels below. Years with one technology, such as "5+ years of Node.js", stay a must-have.',
      'Leave minYears and seniority null when the job does not ask for them; a title such as Software Engineer names no level.',
      'Write one requirement per item: "Node.js and PostgreSQL" becomes two items.',
      'Keep only what the job states, and return an empty list when it states none of a kind, because an invented requirement would cost candidates points.',
      'Write in Brazilian Portuguese, keeping the canonical names of technologies such as PostgreSQL and Node.js, so jobs and resumes use the same words.',
    ],
    sections: [SENIORITY_SECTION],
  }),
  schema: jobRequirementsSchema,
  data: ({ title, area, description }) =>
    dataBlock(
      'job',
      `Title: ${title}\nArea: ${area}\nDescription:\n${description}`
    ),
  task: 'List the requirements of the job above.',
  fake: () => ({
    mustHave: [
      {
        text: 'Placeholder requirement from the fake model',
        importance: 'primary',
      },
    ],
    niceToHave: [],
    experience: { minYears: null, seniority: null },
  }),
}
