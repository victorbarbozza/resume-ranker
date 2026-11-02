import { describe, expect, test } from 'bun:test'

import { getFile, putFile } from './index'

describe('file storage', () => {
  test('gives back the bytes stored under a key', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4 resume')

    await putFile('resumes:storage-test', bytes)

    expect(await getFile('resumes:storage-test')).toEqual(Buffer.from(bytes))
  })

  test('storing the same key twice keeps one copy of the bytes', async () => {
    const bytes = new TextEncoder().encode('same resume')

    await putFile('resumes:twice', bytes)
    await putFile('resumes:twice', bytes)

    expect(await getFile('resumes:twice')).toEqual(Buffer.from(bytes))
  })

  test('answers null for a key that holds nothing', async () => {
    expect(await getFile('resumes:missing')).toBeNull()
  })
})
