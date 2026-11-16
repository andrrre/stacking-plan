import { useCallback, useMemo } from 'react'
import { selectBuilding } from '../../app/state/selectBuilding'
import { useAppState } from '../../app/state/useAppState'
import type { Candidate } from '../../domain/types'
import { useMatches } from '../finder/useMatches'
import { enterFullscreen } from '../layout/fullscreen'
import { useReducedMotion } from '../three-d/useReducedMotion'
import { tourFrom, tourStops } from './tourStops'

/** The stops a tour would visit now (see tourStops). */
export function useTourStops(): Candidate[] {
  const { state } = useAppState()
  const { matches } = useMatches()
  const building = selectBuilding(state)
  const { buildingId, asOf, today, shortlist } = state
  const { includePotential } = state.req
  return useMemo(
    () => tourStops({ building, buildingId, asOf, today, shortlist, matches, includePotential }),
    [building, buildingId, asOf, today, shortlist, matches, includePotential],
  )
}

/**
 * Starts a tour: at its first stop, or (`suiteId`) at the stop holding that suite, `own` being the suite's own
 * stop when none does. Enters presentation mode (fullscreen where the browser allows it, as Present does). It
 * plays on its own unless the user asks for reduced motion.
 */
export function useStartTour(): (suiteId?: string, own?: Candidate | null) => void {
  const { state, dispatch } = useAppState()
  const stops = useTourStops()
  const reduced = useReducedMotion()
  const { presenting } = state
  return useCallback((suiteId?: string, own: Candidate | null = null) => {
    const from = suiteId === undefined ? { stops, index: 0 } : tourFrom(stops, suiteId, own)
    if (from.stops.length === 0) return
    dispatch({ type: 'tour/start', stops: from.stops, index: from.index, playing: !reduced })
    if (!presenting) void enterFullscreen(document.documentElement)
  }, [stops, reduced, presenting, dispatch])
}
