import { describe, expect, test } from 'bun:test'

import { sampleDocx, samplePdf, sampleZip } from '@/server/test/files'

import { detectResumeType, RESUME_MIME_TYPES } from './resume-type'

describe('detectResumeType', () => {
  test('reads PDF and DOCX from the bytes', async () => {
    expect(await detectResumeType(samplePdf)).toBe(RESUME_MIME_TYPES.pdf)
    expect(await detectResumeType(sampleDocx)).toBe(RESUME_MIME_TYPES.docx)
  })

  test('rejects plain text, an image and a zip that is not a DOCX', async () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48,
      0x44, 0x52,
    ])

    expect(
      await detectResumeType(new TextEncoder().encode('Ana Souza, engineer'))
    ).toBeUndefined()
    expect(await detectResumeType(png)).toBeUndefined()
    expect(await detectResumeType(sampleZip)).toBeUndefined()
  })
})
