import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { api } from '@/server/api'
import { db } from '@/server/shared/connectors/postgres'
import { getFile } from '@/server/shared/connectors/storage'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as resumeFilesRepo from '@/server/shared/database/repositories/resume-files'
import { tasks } from '@/server/shared/database/schema'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { samplePdf, uniquePdf } from '@/server/test/files'
import { createCandidate } from '@/server/test/fixtures'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const upload = (files: File[]) => {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  return api.request('/api/candidates', { method: 'POST', body: form })
}

const call = (method: string, path: string) =>
  api.request(`/api/candidates${path}`, { method })

const profileTasks = () =>
  db.select().from(tasks).where(eq(tasks.type, 'candidate.extract_profile'))

const uniqueResume = () => new File([uniquePdf()], 'resume.pdf')

describe('POST /api/candidates', () => {
  test('stores each new file, queues its profile and answers 202 at once', async () => {
    const response = await upload([
      new File([samplePdf], 'ana.pdf'),
      uniqueResume(),
    ])
    const { results } = await response.json()

    expect(response.status).toBe(202)
    expect(
      results.map((result: { fileName: string; status: string }) => [
        result.fileName,
        result.status,
      ])
    ).toEqual([
      ['ana.pdf', 'accepted'],
      ['resume.pdf', 'accepted'],
    ])
    expect(await profileTasks()).toHaveLength(2)

    const [ana] = results
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
    const first = await upload([new File([samplePdf], 'ana.pdf')])
    const [ana] = (await first.json()).results

    const again = await upload([
      new File([samplePdf], 'ana-copy.pdf'),
      new File([samplePdf], 'ana-again.pdf'),
    ])

    expect((await again.json()).results).toEqual([
      {
        fileName: 'ana-copy.pdf',
        status: 'duplicate',
        candidateId: ana.candidateId,
      },
      {
        fileName: 'ana-again.pdf',
        status: 'duplicate',
        candidateId: ana.candidateId,
      },
    ])
    expect(await profileTasks()).toHaveLength(1)
  })

  test('rejects an empty file, one over 2 MB and one of another kind, and keeps the rest', async () => {
    const response = await upload([
      new File([], 'empty.pdf'),
      new File([new Uint8Array(2 * 1024 * 1024 + 1).fill(0x41)], 'big.pdf'),
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00])], 'photo.pdf'),
      uniqueResume(),
    ])
    const { results } = await response.json()

    expect(
      results.map((result: { status: string; error?: string }) => [
        result.status,
        result.error,
      ])
    ).toEqual([
      ['rejected', 'the file must have between 1 byte and 2 MB'],
      ['rejected', 'the file must have between 1 byte and 2 MB'],
      ['rejected', 'only PDF and DOCX files are accepted'],
      ['accepted', undefined],
    ])
  })

  test('answers 400 without files and 413 for a body over the limit', async () => {
    const empty = await api.request('/api/candidates', {
      method: 'POST',
      body: new FormData(),
    })
    const tooLarge = await api.request('/api/candidates', {
      method: 'POST',
      body: 'x',
      headers: { 'Content-Length': String(100 * 1024 * 1024) },
    })

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

    const response = await call('GET', '')
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

    const pending = await call('POST', `/${candidate.id}/retry`)
    await candidatesRepo.setStatus(candidate.id, 'failed')
    const failed = await call('POST', `/${candidate.id}/retry`)

    expect(pending.status).toBe(409)
    expect((await pending.json()).error).toBe('PROFILE_NOT_FAILED')
    expect(failed.status).toBe(202)
    expect((await failed.json()).status).toBe('pending')
    expect(await profileTasks()).toHaveLength(1)
  })
})

describe('DELETE /api/candidates/:id', () => {
  test('hides the candidate, and the same file can be uploaded again', async () => {
    const first = await upload([new File([samplePdf], 'ana.pdf')])
    const [ana] = (await first.json()).results

    const removed = await call('DELETE', `/${ana.candidateId}`)
    const again = await upload([new File([samplePdf], 'ana.pdf')])

    expect(removed.status).toBe(204)
    expect((await again.json()).results[0].status).toBe('accepted')
  })
})

describe('unknown candidates', () => {
  test('retry and delete answer 404', async () => {
    const id = crypto.randomUUID()

    const retried = await call('POST', `/${id}/retry`)
    const removed = await call('DELETE', `/${id}`)

    expect(retried.status).toBe(404)
    expect((await retried.json()).error).toBe('CANDIDATE_NOT_FOUND')
    expect(removed.status).toBe(404)
  })
})
