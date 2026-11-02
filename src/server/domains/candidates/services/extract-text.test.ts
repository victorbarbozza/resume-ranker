import { describe, expect, test } from 'bun:test'

import { sampleDocx, samplePdf, sampleResumeText } from '@/server/test/files'

import { extractResumeText } from './extract-text'
import { RESUME_MIME_TYPES } from './resume-type'

describe('extractResumeText', () => {
  test('reads the text of a PDF, a DOCX and a plain text file', async () => {
    expect(
      (await extractResumeText(RESUME_MIME_TYPES.pdf, samplePdf)).trim()
    ).toBe(sampleResumeText)
    expect(
      (await extractResumeText(RESUME_MIME_TYPES.docx, sampleDocx)).trim()
    ).toBe(sampleResumeText)
    expect(
      await extractResumeText(
        RESUME_MIME_TYPES.txt,
        new TextEncoder().encode('Ana Souza')
      )
    ).toBe('Ana Souza')
  })

  test('a broken PDF fails', async () => {
    await expect(
      extractResumeText(
        RESUME_MIME_TYPES.pdf,
        new TextEncoder().encode('%PDF-1.4 broken')
      )
    ).rejects.toThrow()
  })
})
