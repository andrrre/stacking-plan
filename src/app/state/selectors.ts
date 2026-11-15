import { BUNDLED_BUILDINGS } from '../../data'
import { sliderDate } from '../../domain/dates'
import { HORIZON_MONTHS } from '../../domain/constants'
import type { Building, ISODate, Requirement } from '../../domain/types'
import type { AppState } from './types'

export function selectBuildings(s: AppState): Building[] {
  return [...BUNDLED_BUILDINGS, ...s.importedBuildings]
}

/** The building by id, falling back to the first bundled building. */
export function selectBaseBuilding(s: AppState): Building {
  return selectBuildings(s).find((b) => b.id === s.buildingId) ?? BUNDLED_BUILDINGS[0]
}

/** null until a minimum size is entered; null draft fields become absent. */
export function activeRequirement(s: AppState): Requirement | null {
  const { minSf, maxSf, maxRentPsf, includePotential } = s.req
  if (minSf === null) return null
  return {
    minSf,
    includePotential,
    ...(maxSf !== null && { maxSf }),
    ...(maxRentPsf !== null && { maxRentPsf }),
  }
}

export function horizonEnd(s: AppState): ISODate {
  return sliderDate(s.today, HORIZON_MONTHS)
}
