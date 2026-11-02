import type { LanguageModel } from 'ai'

import { generateJson } from '@/server/shared/connectors/llm'
import { getFile } from '@/server/shared/connectors/storage'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as resumeFilesRepo from '@/server/shared/database/repositories/resume-files'
import { RESUME_TEXT_MAX_CHARS } from '@/server/shared/schemas/candidate.schema'
import { candidateProfilePrompt } from '@/server/tasks/prompts/candidate-extract-profile'
import { buildRequest } from '@/server/tasks/prompts/prompt'

import { extractResumeText } from './extract-text'

/**
 * Turns one candidate's resume into the profile rankings read, in two steps
 * that are each saved before the next: the text from the file, then the
 * profile from the LLM. A retry after an LLM failure reuses the saved text.
 * Does nothing when the candidate was deleted. Only the worker imports this,
 * so the web server never loads the PDF reader or the LLM SDK.
 *
 * `today` is the date years of experience run to; `model` is for tests.
 */
export const extractProfile = async (
  candidateId: string,
  today: string,
  model?: LanguageModel
): Promise<void> => {
  let resumeText = await candidatesRepo.findResumeText(candidateId)
  if (resumeText === undefined) return

  if (resumeText === null) {
    const file = await resumeFilesRepo.findByCandidateId(candidateId)
    if (!file) throw new Error('the candidate has no resume file')
    const bytes = await getFile(file.storageKey)
    if (!bytes) {
      throw new Error(
        `could not read the resume file from the storage: ${file.storageKey}`
      )
    }
    resumeText = (await extractResumeText(file.mimeType, bytes))
      .trim()
      .slice(0, RESUME_TEXT_MAX_CHARS)
    if (!resumeText) {
      throw new Error('the resume has no text; a scanned PDF needs OCR')
    }
    await candidatesRepo.saveResumeText(candidateId, resumeText)
  }

  const { output, model: modelName } = await generateJson(
    buildRequest(candidateProfilePrompt, { resumeText, today }),
    model
  )
  await candidatesRepo.saveProfile(candidateId, {
    name: output.name,
    profile: output.profile,
    areas: output.areas,
    generatedBy: {
      model: modelName,
      promptVersion: candidateProfilePrompt.version,
    },
  })
}
