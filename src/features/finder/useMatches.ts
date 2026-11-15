import { useMemo } from 'react'
import { selectBuilding } from '../../app/state/selectBuilding'
import { useAppState } from '../../app/state/useAppState'
import { findFits } from '../../domain/findFits'
import type { Candidate, Requirement } from '../../domain/types'

export type Matches = { req: Requirement | null; matches: Candidate[] }

/** Ranked fits for the active requirement on the shown building (selectBuilding: the scenario applies). */
export function useMatches(): Matches {
  const { state } = useAppState()
  const building = selectBuilding(state)
  const { asOf, today } = state
  const { minSf, maxSf, maxRentPsf, includePotential } = state.req
  // Same shape as activeRequirement(); built from the fields so `req` stays stable across unrelated actions.
  const req = useMemo((): Requirement | null => (minSf === null ? null : {
    minSf,
    includePotential,
    ...(maxSf !== null && { maxSf }),
    ...(maxRentPsf !== null && { maxRentPsf }),
  }), [minSf, maxSf, maxRentPsf, includePotential])
  return useMemo(() => ({ req, matches: req ? findFits(building, req, asOf, today) : [] }), [building, req, asOf, today])
}
