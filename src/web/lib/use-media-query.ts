import { useSyncExternalStore } from 'react'

/** Whether a media query matches now, updated when the window changes */
export const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const media = matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => matchMedia(query).matches
  )

/** The phone layout: a tab bar, full-width lists and results on their own screen */
export const PHONE_QUERY = '(max-width: 767px)'
