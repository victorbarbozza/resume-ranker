import { deflateRawSync } from 'node:zlib'

import { describe, expect, test } from 'bun:test'

import { sampleDocx, samplePdf, sampleResumeText } from '@/server/test/files'

import { DOCX_UNZIPPED_MAX_BYTES, extractResumeText } from './extract-text'
import { RESUME_MIME_TYPES } from './resume-type'

/** A zip holding one deflated file, laid out as every zip is: local header, data, directory, end record */
const zipOf = (name: string, content: Uint8Array): Uint8Array => {
  const fileName = new TextEncoder().encode(name)
  const data = deflateRawSync(content)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(data.byteLength, 18)
  local.writeUInt32LE(content.byteLength, 22)
  local.writeUInt16LE(fileName.byteLength, 26)
  const directory = Buffer.alloc(46)
  directory.writeUInt32LE(0x02014b50, 0)
  directory.writeUInt16LE(8, 10)
  directory.writeUInt32LE(data.byteLength, 20)
  directory.writeUInt32LE(content.byteLength, 24)
  directory.writeUInt16LE(fileName.byteLength, 28)
  const directoryOffset =
    local.byteLength + fileName.byteLength + data.byteLength
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(directory.byteLength + fileName.byteLength, 12)
  end.writeUInt32LE(directoryOffset, 16)
  return Buffer.concat([local, fileName, data, directory, fileName, end])
}

describe('extractResumeText', () => {
  test('reads the text of a PDF and a DOCX', async () => {
    expect(
      (await extractResumeText(RESUME_MIME_TYPES.pdf, samplePdf)).trim()
    ).toBe(sampleResumeText)
    expect(
      (await extractResumeText(RESUME_MIME_TYPES.docx, sampleDocx)).trim()
    ).toBe(sampleResumeText)
  })

  test('a DOCX that unzips past the limit fails before it is opened', async () => {
    const bomb = zipOf(
      'word/document.xml',
      new Uint8Array(DOCX_UNZIPPED_MAX_BYTES + 1)
    )

    expect(bomb.byteLength).toBeLessThan(200_000)
    await expect(
      extractResumeText(RESUME_MIME_TYPES.docx, bomb)
    ).rejects.toThrow('the DOCX unzips to more than 50 MB')
  })

  test('a file that is not a zip fails as a DOCX', async () => {
    await expect(
      extractResumeText(RESUME_MIME_TYPES.docx, new Uint8Array(100))
    ).rejects.toThrow('the DOCX has no zip directory')
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
