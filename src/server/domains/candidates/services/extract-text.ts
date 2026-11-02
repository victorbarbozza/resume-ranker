import mammoth from 'mammoth'
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf'

import { RESUME_MIME_TYPES } from './resume-type'

/**
 * The text of a resume file. Only the worker calls it: reading a PDF is heavy
 * CPU work that would hold up every request of the web server. The PDF reader
 * takes over the buffer it reads, so it gets a copy and the caller's bytes stay
 * intact.
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
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    })
    return value
  }
  throw new Error(`no text extractor for ${mimeType}`)
}
