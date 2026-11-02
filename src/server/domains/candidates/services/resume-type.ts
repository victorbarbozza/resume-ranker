/** The mime types a resume can have, as the database stores them */
export const RESUME_MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
}

/** The first bytes of every PDF: %PDF- */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]

/** The first bytes of every zip; a DOCX is a zip */
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]

/** Whether the bytes start with the signature */
const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((byte, index) => bytes[index] === byte)

/** Whether the bytes are UTF-8 text with no NUL byte, which binary files almost always have */
const isPlainText = (bytes: Uint8Array) => {
  if (bytes.includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return true
  } catch {
    return false
  }
}

/**
 * The mime type of a resume, read from its first bytes and never from what
 * the browser says. Undefined for anything that is not a PDF, a DOCX or plain
 * text, so a renamed file of another kind never gets in.
 */
export const detectResumeType = (
  name: string,
  bytes: Uint8Array
): string | undefined => {
  if (startsWith(bytes, PDF_SIGNATURE)) return RESUME_MIME_TYPES.pdf
  if (
    startsWith(bytes, ZIP_SIGNATURE) &&
    name.toLowerCase().endsWith('.docx')
  ) {
    return RESUME_MIME_TYPES.docx
  }
  if (isPlainText(bytes)) return RESUME_MIME_TYPES.txt
  return undefined
}
