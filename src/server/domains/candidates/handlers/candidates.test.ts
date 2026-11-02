import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { db } from '@/server/shared/connectors/postgres'
import { getFile } from '@/server/shared/connectors/storage'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as resumeFilesRepo from '@/server/shared/database/repositories/resume-files'
import { tasks } from '@/server/shared/database/schema'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { samplePdf } from '@/server/test/files'
import { createCandidate } from '@/server/test/fixtures'

import { handler as deleteCandidate } from './delete-candidate'
import { handler as listCandidates } from './list-candidates'
import { handler as retryProfile } from './retry-candidate-profile'
import { handler as uploadResumes } from './upload-resumes'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const url = 'http://localhost/api/candidates'

const multipart = async (form: FormData) => {
  const encoded = new Response(form)
  const contentType = encoded.headers.get('Content-Type') ?? ''
  const body = await encoded.arrayBuffer()
  return new Request(url, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(body.byteLength),
    },
  })
}

const upload = (files: File[]) => {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  return multipart(form)
}

const withId = (id: string) => ({ params: Promise.resolve({ id }) })

const profileTasks = () =>
  db.select().from(tasks).where(eq(tasks.type, 'candidate.extract_profile'))

const uniqueText = () =>
  new File([`Resume ${crypto.randomUUID()}`], 'resume.txt', {
    type: 'text/plain',
  })

describe('POST /api/candidates', () => {
  test('stores each new file, queues its profile and answers 202 at once', async () => {
    const response = await uploadResumes(
      await upload([new File([samplePdf], 'ana.pdf'), uniqueText()])
    )
    const summary = await response.json()

    expect(response.status).toBe(202)
    expect(
      summary.accepted.map((item: { fileName: string }) => item.fileName)
    ).toEqual(['ana.pdf', 'resume.txt'])
    expect(await profileTasks()).toHaveLength(2)

    const [ana] = summary.accepted
    const file = await resumeFilesRepo.findByCandidateId(ana.candidateId)
    expect(file?.mimeType).toBe('application/pdf')
    expect(await getFile(file?.storageKey ?? '')).toEqual(
      Buffer.from(samplePdf)
    )
    expect(await candidatesRepo.findById(ana.candidateId)).toMatchObject({
      status: 'pending',
      fileName: 'ana.pdf',
    })
  })

  test('a file already in the base is a duplicate, in the same upload or a later one', async () => {
    const first = await uploadResumes(
      await upload([new File([samplePdf], 'ana.pdf')])
    )
    const { accepted } = await first.json()

    const again = await uploadResumes(
      await upload([
        new File([samplePdf], 'ana-copy.pdf'),
        new File([samplePdf], 'ana-again.pdf'),
      ])
    )

    expect((await again.json()).duplicates).toEqual([
      { fileName: 'ana-copy.pdf', candidateId: accepted[0].candidateId },
      { fileName: 'ana-again.pdf', candidateId: accepted[0].candidateId },
    ])
    expect(await profileTasks()).toHaveLength(1)
  })

  test('rejects an empty file, one over 2 MB and one of another kind, and keeps the rest', async () => {
    const response = await uploadResumes(
      await upload([
        new File([], 'empty.pdf'),
        new File([new Uint8Array(2 * 1024 * 1024 + 1).fill(0x41)], 'big.txt'),
        new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00])], 'photo.pdf'),
        uniqueText(),
      ])
    )
    const summary = await response.json()

    expect(
      summary.rejected.map((item: { error: string }) => item.error)
    ).toEqual([
      'the file must have between 1 byte and 2 MB',
      'the file must have between 1 byte and 2 MB',
      'only PDF, DOCX and plain text files are accepted',
    ])
    expect(summary.accepted).toHaveLength(1)
  })

  test('answers 400 without files and 413 for a body over the limit', async () => {
    const empty = await uploadResumes(await multipart(new FormData()))
    const tooLarge = await uploadResumes(
      new Request(url, {
        method: 'POST',
        body: 'x',
        headers: { 'Content-Length': String(100 * 1024 * 1024) },
      })
    )

    expect(empty.status).toBe(400)
    expect(tooLarge.status).toBe(413)
  })
})

describe('GET /api/candidates', () => {
  test('lists live candidates with their status', async () => {
    await createCandidate({ fileName: 'older.pdf' })
    await createCandidate({ fileName: 'newer.pdf' })
    const deleted = await createCandidate({ fileName: 'deleted.pdf' })
    await candidatesRepo.softDelete(deleted.id)

    const response = await listCandidates(new Request(url))
    const { candidates } = await response.json()

    expect(
      candidates.map((candidate: { fileName: string; status: string }) => [
        candidate.fileName,
        candidate.status,
      ])
    ).toEqual([
      ['newer.pdf', 'pending'],
      ['older.pdf', 'pending'],
    ])
  })
})

describe('POST /api/candidates/:id/retry', () => {
  test('queues a failed profile again, and answers 409 while it has not failed', async () => {
    const candidate = await createCandidate()

    const pending = await retryProfile(
      new Request(url, { method: 'POST' }),
      withId(candidate.id)
    )
    await candidatesRepo.setStatus(candidate.id, 'failed')
    const failed = await retryProfile(
      new Request(url, { method: 'POST' }),
      withId(candidate.id)
    )

    expect(pending.status).toBe(409)
    expect((await pending.json()).error).toBe('PROFILE_NOT_FAILED')
    expect(failed.status).toBe(202)
    expect((await failed.json()).status).toBe('pending')
    expect(await profileTasks()).toHaveLength(1)
  })
})

describe('DELETE /api/candidates/:id', () => {
  test('hides the candidate, and the same file can be uploaded again', async () => {
    const first = await uploadResumes(
      await upload([new File([samplePdf], 'ana.pdf')])
    )
    const [ana] = (await first.json()).accepted

    const removed = await deleteCandidate(
      new Request(url, { method: 'DELETE' }),
      withId(ana.candidateId)
    )
    const again = await uploadResumes(
      await upload([new File([samplePdf], 'ana.pdf')])
    )

    expect(removed.status).toBe(204)
    expect((await again.json()).accepted).toHaveLength(1)
  })
})
