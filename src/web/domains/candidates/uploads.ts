import { useSyncExternalStore } from 'react'

import type { UploadResult } from '@/server/domains/candidates/services/upload-resumes'
import { RESUME_FILE_MAX_BYTES } from '@/shared/limits'
import type { ApiErrorCode } from '@/web/i18n/locales/errors'
import { failureCode, toApiFailure } from '@/web/lib/api'
import { signInAgain } from '@/web/lib/query-client'

import { refreshCandidates, uploadResumes } from './queries'

/** Files per request: few, so each file's answer shows soon */
const BATCH_SIZE = 5
/** Requests sent at the same time */
const PARALLEL_REQUESTS = 2

/**
 * Where one chosen file stands.
 *
 * - `rejected`: the browser or the API refused it; sending it again changes nothing
 * - `failed`: no answer came, such as a dropped connection; it can be sent again
 */
export type UploadStatus =
  'waiting' | 'sending' | 'added' | 'duplicate' | 'rejected' | 'failed'

/** Why a file was rejected or failed, as a code the screen explains */
export type UploadReason = ApiErrorCode | 'UNKNOWN'

/** A new status for a file, with the reason when it went wrong */
type Change = { status: UploadStatus; reason?: UploadReason }

/** One chosen file and what happened to it */
export type Upload = Change & { key: string; file: File }

/** Every file chosen in this tab, newest first; kept while the person moves between screens */
let uploads: Upload[] = []
/** Requests waiting for an answer */
let sending = 0
/** The key the next chosen file gets */
let nextKey = 0
/** Screens showing the uploads */
const listeners = new Set<() => void>()

/** Whether a file still has to be sent or answered */
export const isOpen = (upload: Upload) =>
  upload.status === 'waiting' || upload.status === 'sending'

/** Replaces the uploads and tells every screen showing them */
const update = (change: (current: Upload[]) => Upload[]) => {
  uploads = change(uploads)
  for (const listener of listeners) listener()
}

/** Gives the files with these keys a new status */
const mark = (keys: string[], change: Change) =>
  update((current) =>
    current.map((upload) =>
      keys.includes(upload.key) ? { ...upload, ...change } : upload
    )
  )

/** What the browser can tell before sending: a file that is not a PDF or DOCX, or is empty or over 2 MB, never leaves; the API checks again */
const check = (file: File): Change => {
  if (!/\.(pdf|docx)$/i.test(file.name)) {
    return { status: 'rejected', reason: 'FILE_TYPE' }
  }
  if (file.size === 0 || file.size > RESUME_FILE_MAX_BYTES) {
    return { status: 'rejected', reason: 'FILE_SIZE' }
  }
  return { status: 'waiting' }
}

/** What the API did with one file */
const outcome = (result: UploadResult | undefined): Change => {
  if (!result) return { status: 'failed', reason: 'UNKNOWN' }
  if (result.status === 'rejected') {
    return { status: 'rejected', reason: result.code }
  }
  return { status: result.status === 'accepted' ? 'added' : 'duplicate' }
}

/**
 * Sends the next files that are waiting, a few per request and two requests
 * at a time, then refreshes the candidates so the new ones appear while the
 * rest are still on their way. A session that ended stops every file still
 * open and sends the person to sign in again.
 */
const sendNext = async () => {
  const batch = uploads.filter((upload) => upload.status === 'waiting')
  if (batch.length === 0 || sending >= PARALLEL_REQUESTS) return
  const files = batch.slice(0, BATCH_SIZE)
  sending += 1
  mark(
    files.map((upload) => upload.key),
    { status: 'sending' }
  )
  void sendNext()
  try {
    const { results } = await uploadResumes(files.map((upload) => upload.file))
    files.forEach((upload, index) =>
      mark([upload.key], outcome(results[index]))
    )
  } catch (error) {
    if (toApiFailure(error).status === 401) {
      mark(
        uploads.filter(isOpen).map((upload) => upload.key),
        { status: 'failed', reason: 'UNAUTHENTICATED' }
      )
      signInAgain()
      return
    }
    mark(
      files.map((upload) => upload.key),
      { status: 'failed', reason: failureCode(error) }
    )
  } finally {
    sending -= 1
  }
  void refreshCandidates()
  void sendNext()
}

/** Adds resumes: files the browser can tell are wrong are rejected at once, the rest are sent */
export const addResumes = (files: File[]) => {
  const fresh = files.map((file) => ({
    key: String(nextKey++),
    file,
    ...check(file),
  }))
  update((current) => [...fresh, ...current])
  void sendNext()
}

/** Sends again the files that got no answer */
export const sendFailedAgain = () => {
  mark(
    uploads
      .filter((upload) => upload.status === 'failed')
      .map((upload) => upload.key),
    { status: 'waiting' }
  )
  void sendNext()
}

/** Forgets every file, once none is still open */
export const clearUploads = () => {
  if (uploads.some(isOpen)) return
  update(() => [])
}

/** Every file chosen in this tab, newest first, rendered again on each change */
export const useUploads = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => uploads
  )

window.addEventListener('beforeunload', (event) => {
  if (uploads.some(isOpen)) event.preventDefault()
})
