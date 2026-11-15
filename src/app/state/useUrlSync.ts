import { useCallback, useEffect, useRef, useState } from 'react'
import { isoDate } from '../../shared/isoDate'
import { serializeUrl } from './url'
import { useAppState } from './useAppState'
import type { AppState } from './types'

/** Trailing delay: a slider drag or typing writes once it pauses (WebKit throws after ~100 writes in a burst). */
export const URL_WRITE_DELAY_MS = 200

/** replaceState only when the string changes; a failed write (e.g. a SecurityError) is ignored. */
function write(next: string): void {
  if (next === location.search) return
  try {
    history.replaceState(history.state, '', `${location.pathname}${next}${location.hash}`)
  } catch {
    // ignored: the next write retries with the then-current state
  }
}

/**
 * Mirrors state into the query string with replaceState (never pushState). The first write is immediate;
 * later ones are debounced and flushed on pagehide and unmount, so the last state is never lost.
 */
export function useUrlSync(): void {
  const { state } = useAppState()
  // `today` is written back only if a valid one was in the URL on load.
  const [todayOnLoad] = useState(() => isoDate.safeParse(new URLSearchParams(location.search).get('today')).success)
  const latest = useRef<AppState>(state)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    write(serializeUrl(latest.current, location.search, todayOnLoad))
  }, [todayOnLoad])

  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  const first = useRef(true)
  useEffect(() => {
    latest.current = state
    if (first.current) {
      first.current = false
      flush()
      return
    }
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(flush, URL_WRITE_DELAY_MS)
  }, [state, flush])
}
