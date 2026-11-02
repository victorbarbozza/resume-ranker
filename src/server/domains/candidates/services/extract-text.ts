import { inflateRawSync } from 'node:zlib'

import mammoth from 'mammoth'
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf'

import { RESUME_MIME_TYPES } from './resume-type'

/** Most bytes the files inside a DOCX may unzip to in total; a real resume unzips to a few MB, a zip bomb to gigabytes */
export const DOCX_UNZIPPED_MAX_BYTES = 50 * 1024 * 1024

/**
 * Throws unless the files inside the DOCX unzip to DOCX_UNZIPPED_MAX_BYTES at
 * most. It inflates each entry itself, its output capped at what is left of
 * the budget, so a zip bomb stops at the cap instead of filling the memory of
 * the process that also serves the API. The sizes a zip declares are never
 * trusted, and a ZIP64 archive, which no resume needs, is refused.
 */
const assertDocxUnzipsSmall = (bytes: Uint8Array) => {
  const refuse = (reason: string): never => {
    throw new Error(`the DOCX ${reason}`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = bytes.byteLength - 22
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1
  if (end < 0) refuse('has no zip directory')

  const entries = view.getUint16(end + 10, true)
  let entry = view.getUint32(end + 16, true)
  let budget = DOCX_UNZIPPED_MAX_BYTES
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(entry, true) !== 0x02014b50) {
      refuse('has a broken zip directory')
    }
    const method = view.getUint16(entry + 10, true)
    const compressedSize = view.getUint32(entry + 20, true)
    const header = view.getUint32(entry + 42, true)
    if (compressedSize === 0xffffffff || header === 0xffffffff) {
      refuse('is a ZIP64 archive')
    }
    const start =
      header +
      30 +
      view.getUint16(header + 26, true) +
      view.getUint16(header + 28, true)
    const data = bytes.subarray(start, start + compressedSize)
    if (method === 0) {
      budget -= data.byteLength
    } else if (method === 8) {
      try {
        budget -= inflateRawSync(data, {
          maxOutputLength: Math.max(budget, 1),
        }).byteLength
      } catch {
        refuse(
          `unzips to more than ${DOCX_UNZIPPED_MAX_BYTES / 1024 / 1024} MB or is damaged`
        )
      }
    } else {
      refuse(`uses zip compression method ${method}`)
    }
    if (budget < 0) {
      refuse(`unzips to more than ${DOCX_UNZIPPED_MAX_BYTES / 1024 / 1024} MB`)
    }
    entry +=
      46 +
      view.getUint16(entry + 28, true) +
      view.getUint16(entry + 30, true) +
      view.getUint16(entry + 32, true)
  }
}

/**
 * The text of a resume file. Only the task worker calls it. The PDF reader
 * yields between pages and takes over the buffer it reads, so it gets a copy
 * and the caller's bytes stay intact. A DOCX is checked to unzip to a sane
 * size before it is opened, since the same process serves the API.
 */
export const extractResumeText = async (
  mimeType: string,
  bytes: Uint8Array
): Promise<string> => {
  if (mimeType === RESUME_MIME_TYPES.pdf) {
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const { text } = await extractPdfText(pdf, { mergePages: true })
    return text
  }
  if (mimeType === RESUME_MIME_TYPES.docx) {
    assertDocxUnzipsSmall(bytes)
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    })
    return value
  }
  throw new Error(`no text extractor for ${mimeType}`)
}
