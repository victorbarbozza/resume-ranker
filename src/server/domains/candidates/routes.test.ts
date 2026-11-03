import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { api } from '@/server/api'
import { db } from '@/server/shared/connectors/postgres'
import { getFile } from '@/server/shared/connectors/storage'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as resumeFilesRepo from '@/server/shared/database/repositories/resume-files'
import { tasks } from '@/server/shared/database/schema'
import { candidateProfilePrompt } from '@/server/tasks/prompts/candidate-extract-profile'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { samplePdf, uniquePdf } from '@/server/test/files'
import {
  createCandidate,
  createReadyCandidate,
  profileWith,
  signedInHeaders,
} from '@/server/test/fixtures'
import { DELETE_MAX_CANDIDATES } from '@/shared/limits'

let signedIn: Record<string, string>

beforeAll(prepareTestDatabase)
beforeEach(async () => {
  await resetDatabase()
  signedIn = await signedInHeaders()
})

const upload = (files: File[]) => {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  return api.request('/api/candidates', {
    method: 'POST',
    body: form,
    headers: signedIn,
  })
}

const call = (method: string, path: string) =>
  api.request(`/api/candidates${path}`, { method, headers: signedIn })

const deleteMany = (ids: string[]) =>
  api.request('/api/candidates/delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
    headers: { ...signedIn, 'Content-Type': 'application/json' },
  })

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
      results.map((result: { status: string; code?: string }) => [
        result.status,
        result.code,
      ])
    ).toEqual([
      ['rejected', 'FILE_SIZE'],
      ['rejected', 'FILE_SIZE'],
      ['rejected', 'FILE_TYPE'],
      ['accepted', undefined],
    ])
  })

  test('answers 400 without files and 413 for a body over the limit', async () => {
    const empty = await api.request('/api/candidates', {
      method: 'POST',
      body: new FormData(),
      headers: signedIn,
    })
    const tooLarge = await api.request('/api/candidates', {
      method: 'POST',
      body: 'x',
      headers: { ...signedIn, 'Content-Length': String(100 * 1024 * 1024) },
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

  test('filters by the query and pages with the cursor it answers', async () => {
    for (const name of ['Ana Lima', 'Ana Souza', 'Bruno Reis']) {
      await createReadyCandidate({ name })
    }

    const ana = await (await call('GET', '?search=ana')).json()
    const none = await (await call('GET', '?status=failed')).json()

    expect(
      ana.candidates.map((candidate: { name: string }) => candidate.name)
    ).toEqual(['Ana Souza', 'Ana Lima'])
    expect(ana.nextCursor).toBeNull()
    expect(ana.anyFailed).toBe(false)
    expect(none.candidates).toEqual([])
  })

  test('refuses a cursor or a filter it does not know', async () => {
    const cursor = await call('GET', '?cursor=not-an-id')
    const area = await call('GET', '?area=astrology')

    expect(cursor.status).toBe(400)
    expect(area.status).toBe(400)
  })
})

describe('POST /api/candidates/:id/retry', () => {
  test('queues a failed profile again, and answers 409 while it has not failed', async () => {
    const candidate = await createCandidate()

    const pending = await call('POST', `/${candidate.id}/retry`)
    await candidatesRepo.setStatus(candidate.id, 'failed')
    const failed = await call('POST', `/${candidate.id}/retry`)

    expect(pending.status).toBe(409)
    expect((await pending.json()).error).toBe('PROFILE_NOT_RETRYABLE')
    expect(failed.status).toBe(202)
    expect((await failed.json()).status).toBe('pending')
    expect(await profileTasks()).toHaveLength(1)
  })

  test('reads a profile from an older prompt again, but not a current one', async () => {
    const older = await createReadyCandidate({ name: 'Ana Lima' })
    const current = await createCandidate()
    await candidatesRepo.saveProfile(current.id, {
      name: 'Bruno Reis',
      profile: profileWith([]),
      areas: ['engineering'],
      generatedBy: {
        model: 'fake',
        promptVersion: candidateProfilePrompt.version,
      },
    })

    const list = await (await call('GET', '')).json()
    const reread = await call('POST', `/${older}/retry`)
    const refused = await call('POST', `/${current.id}/retry`)

    expect(
      list.candidates.map(
        (candidate: { name: string; stale: boolean }) =>
          `${candidate.name} ${candidate.stale}`
      )
    ).toEqual(['Bruno Reis false', 'Ana Lima true'])
    expect(reread.status).toBe(202)
    expect(refused.status).toBe(409)
  })
})

describe('POST /api/candidates/delete', () => {
  test('hides the live candidates among the ids and answers how many', async () => {
    const [ana, bruno, carla] = await Promise.all(
      ['Ana', 'Bruno', 'Carla'].map((name) => createReadyCandidate({ name }))
    )
    await candidatesRepo.softDelete(carla)

    const response = await deleteMany([ana, bruno, carla])
    const list = await (await call('GET', '')).json()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: 2 })
    expect(list.candidates).toEqual([])
  })

  test('refuses an empty list, a bad id or more than the limit', async () => {
    const tooMany = Array.from({ length: DELETE_MAX_CANDIDATES + 1 }, () =>
      crypto.randomUUID()
    )

    expect((await deleteMany([])).status).toBe(400)
    expect((await deleteMany(['not-an-id'])).status).toBe(400)
    expect((await deleteMany(tooMany)).status).toBe(400)
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
