import { useEffect, useState } from 'react'

/** The value once it has stopped changing for `delayMs`, so a search box asks the server once per pause, not once per key */
export const useDebounced = <Value>(value: Value, delayMs = 300): Value => {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return settled
}
