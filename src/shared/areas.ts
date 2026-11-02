/**
 * Areas a job belongs to and a candidate can match. Shared by the UI (area
 * picker) and the server (validation, database checks, ranking filter).
 */
export const AREAS = [
  'engineering',
  'data',
  'design',
  'product',
  'marketing',
  'sales',
  'finance',
  'people',
  'operations',
  'other',
] as const

/** One of AREAS */
export type Area = (typeof AREAS)[number]
