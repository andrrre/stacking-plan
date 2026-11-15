import { isoDate } from '../../shared/isoDate'
import { BUNDLED_BUILDINGS } from '../../data'
import type { ISODate } from '../../domain/types'
import { loadImported, loadShortlist, type StorageLike } from './storage'
import { parseUrlState } from './url'
import type { AppState } from './types'

/** `?today=YYYY-MM-DD` overrides the clock (tests, recording); an invalid value is ignored. */
function readToday(search: string, clockToday: ISODate): ISODate {
  const parsed = isoDate.safeParse(new URLSearchParams(search).get('today'))
  return parsed.success ? parsed.data : clockToday
}

export function initState(search: string, storage: StorageLike | null, clockToday: ISODate): AppState {
  const today = readToday(search, clockToday)
  const importedBuildings = loadImported(storage)
  const buildings = [...BUNDLED_BUILDINGS, ...importedBuildings]
  const buildingIds = buildings.map((b) => b.id)
  const url = parseUrlState(search, { today, buildingIds })
  return {
    today,
    buildingId: url.buildingId ?? BUNDLED_BUILDINGS[0].id,
    asOf: url.asOf ?? today,
    mode: url.mode ?? 'availability',
    view: url.view ?? 'stack',
    req: { minSf: null, maxSf: null, maxRentPsf: null, includePotential: true, ...url.req },
    selection: null,
    highlight: null,
    changes: [],
    shortlist: loadShortlist(storage, buildings),
    importedBuildings,
    overlay: 'none',
  }
}
