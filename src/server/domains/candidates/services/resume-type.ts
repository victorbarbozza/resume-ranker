import { fileTypeFromBuffer } from 'file-type'

/** The mime types a resume can have, as the database stores them */
export const RESUME_MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

/**
 * The mime type of a resume, read from its bytes and never from its name or
 * what the browser says. `file-type` recognises a PDF, and a DOCX by looking
 * inside the zip for the parts of a Word document. Undefined for anything
 * else, so a renamed file of another kind never gets in.
 */
export const detectResumeType = async (
  bytes: Uint8Array
): Promise<string | undefined> => {
  const detected = await fileTypeFromBuffer(bytes)
  return detected?.mime === RESUME_MIME_TYPES.pdf ||
    detected?.mime === RESUME_MIME_TYPES.docx
    ? detected.mime
    : undefined
}
