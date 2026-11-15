import { useAppState } from '../../app/state/useAppState'
import type { ShortlistEntry } from '../../domain/types'

/** The entries saved for the building on screen, in the order they were saved. */
export function useShortlist(): ShortlistEntry[] {
  const { state } = useAppState()
  return state.shortlist.filter((e) => e.buildingId === state.buildingId)
}
