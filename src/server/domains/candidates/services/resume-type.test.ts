import { describe, expect, test } from 'bun:test'

import { sampleDocx, samplePdf } from '@/server/test/files'

import { detectResumeType, RESUME_MIME_TYPES } from './resume-type'

describe('detectResumeType', () => {
  test('reads PDF, DOCX and plain text from the bytes', () => {
    expect(detectResumeType('cv.pdf', samplePdf)).toBe(RESUME_MIME_TYPES.pdf)
    expect(detectResumeType('cv.docx', sampleDocx)).toBe(RESUME_MIME_TYPES.docx)
    expect(
      detectResumeType(
        'cv.txt',
        new TextEncoder().encode('Ana Souza, engineer')
      )
    ).toBe(RESUME_MIME_TYPES.txt)
  })

  test('trusts the bytes, not the name', () => {
    expect(detectResumeType('cv.docx', samplePdf)).toBe(RESUME_MIME_TYPES.pdf)
  })

  test('rejects an image, a zip that is not a DOCX and invalid UTF-8', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    expect(detectResumeType('cv.pdf', png)).toBeUndefined()
    expect(detectResumeType('archive.zip', sampleDocx)).toBeUndefined()
    expect(
      detectResumeType('cv.txt', new Uint8Array([0xff, 0xfe, 0xfd]))
    ).toBeUndefined()
  })
})
