import { promisify } from 'node:util'
import { inflateRaw } from 'node:zlib'

import mammoth from 'mammoth'
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf'

import { FailNowError } from '@/server/shared/queue/fail-now-error'

import { RESUME_MIME_TYPES } from './resume-type'

/**
 * Most bytes the files inside a DOCX may unzip to in total. A real resume
 * unzips to well under 1 MB; the cap keeps what the reader then builds in
 * memory far below the heap the API shares, while a zip bomb unzips to GBs.
 */
export const DOCX_UNZIPPED_MAX_BYTES = 10 * 1024 * 1024

/** Inflates without blocking the event loop the API answers on */
const inflate = promisify(inflateRaw)

/** A DOCX that cannot be read, which no retry will change */
const refuse = (reason: string): never => {
  throw new FailNowError(`the DOCX ${reason}`)
}

/**
 * Throws unless the files inside the DOCX unzip to DOCX_UNZIPPED_MAX_BYTES at
 * most. It inflates each entry itself, its output capped at what is left of
 * the budget, so a zip bomb stops at the cap instead of filling the memory of
 * the process that also serves the API. The sizes a zip declares are never
 * trusted, a ZIP64 archive, which no resume needs, is refused, and offsets
 * that point outside the file make it damaged.
 */
const assertDocxUnzipsSmall = async (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = bytes.byteLength - 22
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1
  if (end < 0) refuse('has no zip directory')

  const tooBig = `unzips to more than ${DOCX_UNZIPPED_MAX_BYTES / 1024 / 1024} MB`
  let budget = DOCX_UNZIPPED_MAX_BYTES
  try {
    const entries = view.getUint16(end + 10, true)
    let entry = view.getUint32(end + 16, true)
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
      if (start + compressedSize > bytes.byteLength) refuse('is damaged')
      const data = bytes.subarray(start, start + compressedSize)
      if (method === 0) {
        budget -= data.byteLength
      } else if (method === 8) {
        const output = await inflate(data, {
          maxOutputLength: Math.max(budget, 1),
        }).catch(() => refuse(`${tooBig} or is damaged`))
        budget -= output.byteLength
      } else {
        refuse(`uses zip compression method ${method}`)
      }
      if (budget < 0) refuse(tooBig)
      entry +=
        46 +
        view.getUint16(entry + 28, true) +
        view.getUint16(entry + 30, true) +
        view.getUint16(entry + 32, true)
    }
  } catch (error) {
    if (error instanceof FailNowError) throw error
    refuse('is damaged')
  }
}

/**
 * The text of a resume file. Only the task worker calls it. The PDF reader
 * yields between pages and takes over the buffer it reads, so it gets a copy
 * and the caller's bytes stay intact. A DOCX is checked to unzip to a sane
 * size before it is opened, since the same process serves the API; one that
 * fails the check fails its task at once.
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
    await assertDocxUnzipsSmall(bytes)
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    })
    return value
  }
  throw new Error(`no text extractor for ${mimeType}`)
}
