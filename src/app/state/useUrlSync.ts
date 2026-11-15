import { useEffect, useState } from 'react'
import { isoDate } from '../../shared/isoDate'
import { serializeUrl } from './url'
import { useAppState } from './useAppState'

/** Mirrors state into the query string with replaceState (never pushState), only when the string changes. */
export function useUrlSync(): void {
  const { state } = useAppState()
  // `today` is written back only if a valid one was in the URL on load.
  const [todayOnLoad] = useState(() => isoDate.safeParse(new URLSearchParams(location.search).get('today')).success)
  useEffect(() => {
    const next = serializeUrl(state, location.search, todayOnLoad)
    if (next !== location.search) history.replaceState(history.state, '', `${location.pathname}${next}${location.hash}`)
  }, [state, todayOnLoad])
}
