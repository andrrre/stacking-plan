import type { Building } from '../../domain/types'
import { selectBaseBuilding } from './selectors'
import type { AppState } from './types'

/** The building the app shows. S2: the base building; S11 applies the scenario here. */
export function selectBuilding(s: AppState): Building {
  return selectBaseBuilding(s)
}
