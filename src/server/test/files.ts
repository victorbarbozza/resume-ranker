import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Folder of the sample resumes */
const folder = join(import.meta.dir, 'files')

/** A small real PDF whose text is a one-line resume */
export const samplePdf = new Uint8Array(
  readFileSync(join(folder, 'resume.pdf'))
)

/** A small real DOCX with the same text as samplePdf */
export const sampleDocx = new Uint8Array(
  readFileSync(join(folder, 'resume.docx'))
)

/** The text both sample files hold */
export const sampleResumeText =
  'Ana Souza - Senior backend engineer. Node.js, PostgreSQL.'
