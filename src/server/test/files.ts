import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Folder of the sample resumes */
const folder = join(import.meta.dir, 'files')

/** The text both sample resumes hold */
export const sampleResumeText =
  'Ana Souza - Senior backend engineer. Node.js, PostgreSQL.'

/** A small real PDF whose text is sampleResumeText */
export const samplePdf = new Uint8Array(
  readFileSync(join(folder, 'resume.pdf'))
)

/** A small real DOCX whose text is sampleResumeText */
export const sampleDocx = new Uint8Array(
  readFileSync(join(folder, 'resume.docx'))
)

/** A DOCX whose text is far longer than a resume is allowed to keep */
export const longDocx = new Uint8Array(
  readFileSync(join(folder, 'long-resume.docx'))
)

/** A zip that is not a DOCX: it holds a spreadsheet part */
export const sampleZip = new Uint8Array(
  readFileSync(join(folder, 'spreadsheet.zip'))
)

/** samplePdf with one text replaced by another of the same length, so the PDF stays valid */
const samplePdfWith = (text: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(
    Buffer.from(
      Buffer.from(samplePdf).toString('latin1').replace(sampleResumeText, text),
      'latin1'
    )
  )

/** samplePdf with another name in it, so each call hashes differently */
export const uniquePdf = (): Uint8Array<ArrayBuffer> =>
  samplePdfWith(
    sampleResumeText.replace('Ana Souza', crypto.randomUUID().slice(0, 9))
  )

/** samplePdf with its text blanked out, like a scanned PDF that holds no text */
export const blankPdf = samplePdfWith(' '.repeat(sampleResumeText.length))
