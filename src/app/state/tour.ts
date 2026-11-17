import type { Action, AppState, Tour } from './types'

// The suite tour's part of the reducer. Every function returns a new state; inputs are never mutated.

/** Actions that change what the tour's stops were chosen from (building, date, shortlist, scenario, search) or leave its view. */
const ENDS_TOUR: ReadonlySet<Action['type']> = new Set([
  'building/set', 'building/import', 'building/remove', 'asOf/set', 'noFit/jump', 'shortlist/add', 'shortlist/remove',
  'scenario/add', 'scenario/reset', 'req/set', 'req/clear', 'ask/apply', 'floor/set', 'move/preview',
])

const clamp = (i: number, stops: Tour['stops']) => Math.min(Math.max(i, 0), stops.length - 1)

const sameList = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x, n) => x === b[n])
const sameReq = (a: AppState['req'], b: AppState['req']) =>
  a.minSf === b.minSf && a.maxSf === b.maxSf && a.maxRentPsf === b.maxRentPsf && a.includePotential === b.includePotential

/**
 * Whether anything the tour depends on differs between `a` and `b`. Field by field: a reducer may hand back a new
 * but equal object (a shortlist already full, a preview cleared when none was shown, the same date again).
 */
function tourInputsChanged(a: AppState, b: AppState): boolean {
  return a.buildingId !== b.buildingId || a.asOf !== b.asOf || a.floor !== b.floor || a.movePreview !== b.movePreview
    || !sameList(a.importedBuildings, b.importedBuildings) || !sameList(a.shortlist, b.shortlist)
    || !sameList(a.changes, b.changes) || !sameReq(a.req, b.req)
}

/** Whether `action`, which turned `before` into `after`, ends a running tour. */
export function endsTour(before: AppState, after: AppState, action: Action): boolean {
  if (after.tour === null || after === before) return false
  if (action.type === 'view/set') return action.view !== '3d'
  return ENDS_TOUR.has(action.type) && tourInputsChanged(before, after)
}

/** A dialog opened over a running tour pauses it (closing it again leaves it paused). */
export function setOverlay(state: AppState, overlay: AppState['overlay']): AppState {
  const next = { ...state, overlay }
  return overlay === 'none' ? next : setPlaying(next, false)
}

/** Presents the 3D building at the chosen stop, with nothing else lit or filtered over it. The only way into presentation mode. */
export function startTour(state: AppState, stops: Tour['stops'], index: number, playing: boolean): AppState {
  if (stops.length === 0) return state
  return {
    ...state,
    presenting: true,
    view: '3d',
    floor: null,
    highlight: null,
    legend: null,
    movePreview: null,
    overlay: 'none',
    tour: { stops, index: clamp(index, stops), phase: 'fly', playing },
  }
}

export function goTo(state: AppState, index: number): AppState {
  const t = state.tour
  if (!t || clamp(index, t.stops) === t.index) return state
  return { ...state, tour: { ...t, index: clamp(index, t.stops), phase: 'fly' } }
}

export function setPhase(state: AppState, index: number, phase: Tour['phase']): AppState {
  const t = state.tour
  if (!t || t.index !== index || t.phase === phase) return state
  return { ...state, tour: { ...t, phase } }
}

export function setPlaying(state: AppState, playing: boolean): AppState {
  const t = state.tour
  return !t || t.playing === playing ? state : { ...state, tour: { ...t, playing } }
}

/** Ends the tour and presentation mode with it; the last toured suite stays selected. */
export function exitTour(state: AppState): AppState {
  const id = state.tour?.stops[state.tour.index]?.suiteIds[0]
  if (!state.tour) return state
  return { ...state, tour: null, presenting: false, selection: id === undefined ? state.selection : { kind: 'suite', suiteId: id } }
}
