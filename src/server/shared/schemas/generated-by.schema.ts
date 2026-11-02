import { type Static, Type } from 'typebox'

/**
 * What produced an LLM output: the model and the version of the prompt.
 * Stored with every output, so results made by an older prompt can be told
 * apart and run again.
 */
export const generatedBySchema = Type.Object({
  model: Type.String(),
  promptVersion: Type.String(),
})

/** The model and prompt version behind an LLM output */
export type IGeneratedBy = Static<typeof generatedBySchema>
