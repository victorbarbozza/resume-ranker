import { type Static, Type } from 'typebox'

/**
 * A file of a multipart request, as a handler receives it. TypeBox has no
 * binary type, so `bytes` is checked with a refinement.
 *
 * - `type`: what the browser says the file is; never trusted for the real type
 */
export const uploadedFileSchema = Type.Object({
  name: Type.String(),
  type: Type.String(),
  bytes: Type.Refine(
    Type.Unsafe<Uint8Array>({}),
    (value) => value instanceof Uint8Array
  ),
})

/** A file of a multipart request */
export type UploadedFile = Static<typeof uploadedFileSchema>
