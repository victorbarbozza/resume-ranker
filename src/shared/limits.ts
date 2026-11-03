/** Longest job title accepted */
export const JOB_TITLE_MAX_LENGTH = 200

/** Longest job description accepted */
export const JOB_DESCRIPTION_MAX_LENGTH = 20_000

/** Largest resume file accepted: 2 MB. The screen checks it before sending, the server again on arrival */
export const RESUME_FILE_MAX_BYTES = 2 * 1024 * 1024

/** Most files one upload request takes; the screen splits a larger selection into several requests */
export const UPLOAD_MAX_FILES = 20

/** Most candidates one delete request takes; the screen splits a larger selection into several requests */
export const DELETE_MAX_CANDIDATES = 100

/** Most candidates one ranking sends to the LLM unless RANKING_MAX_CANDIDATES says otherwise; the screen caps a hand-picked ranking at it */
export const DEFAULT_RANKING_MAX_CANDIDATES = 50
