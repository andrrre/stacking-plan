import { snapToSlider } from '../../domain/dates'
import { MAX_SHORTLIST } from '../../domain/constants'
import type { ParsedQuery, ShortlistEntry } from '../../domain/types'
import type { Action, AppState, RequirementDraft } from './types'

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

function addEntry(list: ShortlistEntry[], entry: ShortlistEntry): ShortlistEntry[] {
  if (list.filter((e) => e.buildingId === entry.buildingId).length >= MAX_SHORTLIST || list.some((e) => e.id === entry.id)) return list
  return [...list, entry]
}

/** Switching building clears selection, KPI highlight and the scenario (A8). */
function switchBuilding(state: AppState, buildingId: string): AppState {
  return { ...state, buildingId, selection: null, highlight: null, changes: [] }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'building/set':
      return switchBuilding(state, action.buildingId)
    case 'asOf/set':
      return { ...state, asOf: snapToSlider(action.asOf, state.today) }
    case 'mode/set':
      return { ...state, mode: action.mode }
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
      return {
        ...state,
        req: applyParsed(state.req, action.parsed),
        asOf: action.parsed.moveInBy === undefined ? state.asOf : snapToSlider(action.parsed.moveInBy, state.today),
        selection: null,
      }
    case 'noFit/jump':
      return { ...state, asOf: snapToSlider(action.asOf, state.today), req: { ...state.req, includePotential: true } }
    case 'select':
      return { ...state, selection: action.selection }
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
    case 'building/import': {
      const first = action.buildings[0]
      const imported = { ...state, importedBuildings: [...state.importedBuildings, ...action.buildings] }
      return first ? switchBuilding(imported, first.id) : imported
    }
    case 'overlay/set':
      return { ...state, overlay: action.overlay }
  }
}
