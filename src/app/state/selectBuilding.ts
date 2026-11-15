import { applyScenario } from '../../domain/scenario'
import type { Building, Change } from '../../domain/types'
import { selectBaseBuilding } from './selectors'
import type { AppState } from './types'

type Applied = { changes: readonly Change[]; building: Building }

// Last scenario building per base building. Several hooks call selectBuilding on every render; returning the same
// object for the same (base, changes) pair keeps their useMemo deps stable (findFits, the no-fit scan, kpis).
// One entry per base building: alternating two `changes` arrays for the same base rebuilds the scenario each time.
const cache = new WeakMap<Building, Applied>()

/** The building the app shows: the scenario applied over the base, or the base when it does not apply (A8). */
export function selectBuilding(s: AppState): Building {
  const base = selectBaseBuilding(s)
  if (s.changes.length === 0) return base
  const hit = cache.get(base)
  if (hit && hit.changes === s.changes) return hit.building
  const r = applyScenario(base, s.changes)
  const building = r.ok ? r.building : base
  cache.set(base, { changes: s.changes, building })
  return building
}
