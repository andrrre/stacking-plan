import { BUNDLED_BUILDINGS } from '../../data'
import { snapToSlider } from '../../domain/dates'
import { MAX_SHORTLIST } from '../../domain/constants'
import type { Building, ParsedQuery, ShortlistEntry } from '../../domain/types'
import { selectBuilding } from './selectBuilding'
import { selectBaseBuilding } from './selectors'
import { legendKeys, type FillKey } from './legendKeys'
import type { Action, AppState, ColourMode, RequirementDraft, Selection } from './types'

// Every case returns a new object; inputs are never mutated.

/** Replaces the requirement wholesale so no stale max or rent survives; keeps the potential toggle. */
function applyParsed(req: RequirementDraft, parsed: ParsedQuery): RequirementDraft {
  return {
    minSf: parsed.minSf ?? null,
    maxSf: parsed.maxSf ?? null,
    maxRentPsf: parsed.maxRentPsf ?? null,
    includePotential: req.includePotential,
  }
}

/** An answered ask replaces the requirement, moves to its move-in date (if any) and clears the selection. */
function applyAsk(state: AppState, parsed: ParsedQuery): AppState {
  const asOf = parsed.moveInBy === undefined ? state.asOf : snapToSlider(parsed.moveInBy, state.today)
  return { ...state, req: applyParsed(state.req, parsed), asOf, selection: null }
}

function addEntry(list: ShortlistEntry[], entry: ShortlistEntry): ShortlistEntry[] {
  if (list.filter((e) => e.buildingId === entry.buildingId).length >= MAX_SHORTLIST || list.some((e) => e.id === entry.id)) return list
  return [...list, entry]
}

/** Switching building clears selection, KPI highlight, the scenario (A8) and the legend filter, and leaves floor view. */
function switchBuilding(state: AppState, buildingId: string): AppState {
  return { ...state, buildingId, selection: null, highlight: null, changes: [], floor: null, legend: null }
}

/** The pressed key toggles off; a key the current legend does not show is ignored. */
function toggleLegend(state: AppState, key: FillKey): AppState {
  if (!legendKeys(state.mode).includes(key)) return state
  return { ...state, legend: state.legend === key ? null : key }
}

/** A legend filter survives a colour mode change only if the new legend has the same pill. */
function setMode(state: AppState, mode: ColourMode): AppState {
  const legend = state.legend !== null && legendKeys(mode).includes(state.legend) ? state.legend : null
  return { ...state, mode, legend }
}

/** Floor view follows the selection: a suite (or a match's first suite) on another floor moves it there. */
function select(state: AppState, selection: Selection): AppState {
  if (state.floor === null || selection === null) return { ...state, selection }
  const id = selection.kind === 'suite' ? selection.suiteId : selection.key.split('+')[0]
  const on = selectBuilding(state).floors.find((f) => f.suites.some((x) => x.id === id))
  return { ...state, selection, floor: on?.number ?? state.floor }
}

/** Appends imported buildings and shows the first of them. */
function importBuildings(state: AppState, buildings: Building[]): AppState {
  const first = buildings[0]
  const imported = { ...state, importedBuildings: [...state.importedBuildings, ...buildings] }
  return first ? switchBuilding(imported, first.id) : imported
}

/** A floor the current building has, else null (not in floor view). */
function knownFloor(state: AppState, floor: number | null): number | null {
  return floor !== null && selectBaseBuilding(state).floors.some((f) => f.number === floor) ? floor : null
}

/** Only an imported building can be removed; its shortlist entries go with it. */
function removeBuilding(state: AppState, buildingId: string): AppState {
  if (!state.importedBuildings.some((b) => b.id === buildingId)) return state
  const removed = {
    ...state,
    importedBuildings: state.importedBuildings.filter((b) => b.id !== buildingId),
    shortlist: state.shortlist.filter((e) => e.buildingId !== buildingId),
  }
  return state.buildingId === buildingId ? switchBuilding(removed, BUNDLED_BUILDINGS[0].id) : removed
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'building/set':
      return action.buildingId === state.buildingId ? state : switchBuilding(state, action.buildingId)
    case 'asOf/set':
      return { ...state, asOf: snapToSlider(action.asOf, state.today) }
    case 'mode/set':
      return setMode(state, action.mode)
    case 'view/set':
      return { ...state, view: action.view }
    case 'req/set':
      return {
        ...state,
        req: { ...state.req, ...action.patch },
        selection: state.selection?.kind === 'match' ? null : state.selection,
      }
    case 'req/clear':
      return { ...state, req: { ...state.req, minSf: null, maxSf: null, maxRentPsf: null } }
    case 'ask/apply':
      return applyAsk(state, action.parsed)
    case 'noFit/jump':
      return { ...state, asOf: snapToSlider(action.asOf, state.today), req: { ...state.req, includePotential: true } }
    case 'select':
      return select(state, action.selection)
    case 'highlight/toggle':
      return { ...state, highlight: state.highlight === action.kpi ? null : action.kpi }
    case 'scenario/add':
      return { ...state, changes: [...state.changes, action.change] }
    case 'scenario/reset':
      return { ...state, changes: [] }
    case 'shortlist/add':
      return { ...state, shortlist: addEntry(state.shortlist, action.entry) }
    case 'shortlist/remove':
      return { ...state, shortlist: state.shortlist.filter((e) => e.id !== action.id) }
    case 'building/import':
      return importBuildings(state, action.buildings)
    case 'building/remove':
      return removeBuilding(state, action.buildingId)
    case 'overlay/set':
      return { ...state, overlay: action.overlay }
    case 'floor/set':
      return { ...state, floor: knownFloor(state, action.floor) }
    case 'legend/toggle':
      return toggleLegend(state, action.key)
    case 'present/set':
      return { ...state, presenting: action.on }
  }
}
