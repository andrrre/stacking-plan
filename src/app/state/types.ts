import type { Building, Candidate, Change, ISODate, KpiKey, MoveOption, ParsedQuery, ShortlistEntry } from '../../domain/types'
import type { FillKey } from './legendKeys'

export type { KpiKey }

export type ColourMode = 'availability' | 'risk'
export type ViewMode = 'stack' | '3d'

export type RequirementDraft = {
  minSf: number | null
  maxSf: number | null
  maxRentPsf: number | null
  includePotential: boolean
}

export type Selection = { kind: 'suite'; suiteId: string } | { kind: 'match'; key: string } | null

export type Overlay = 'none' | 'compare' | 'summary'

/** A suite tour's stop: flying to its floor from outside, going in, then standing inside looking out. */
export type TourPhase = 'fly' | 'enter' | 'look'
/** The suite tour in presentation mode: its stops (one per option), the one shown, how far in, auto-advancing or not. */
export type Tour = { stops: Candidate[]; index: number; phase: TourPhase; playing: boolean }

export type AppState = {
  today: ISODate
  buildingId: string
  asOf: ISODate
  mode: ColourMode
  view: ViewMode
  req: RequirementDraft
  selection: Selection
  highlight: KpiKey | null
  changes: Change[]
  shortlist: ShortlistEntry[]
  importedBuildings: Building[]
  overlay: Overlay
  floor: number | null // the floor shown in the 3D floor view; null = the whole building
  legend: FillKey | null // the legend pill pressed: suites painted otherwise are dimmed; null = no filter
  presenting: boolean // presentation mode (drawers shut, fullscreen where the browser allows); never saved
  movePreview: MoveOption | null // the move shown on the building; never saved, never in the URL
  tour: Tour | null // the suite tour (presentation mode only); never saved, never in the URL
}

export type Action =
  | { type: 'building/set'; buildingId: string } // clears selection, highlight, changes, legend filter
  | { type: 'asOf/set'; asOf: ISODate } // snapped to a slider step in [today, sliderDate(today, 60)]
  | { type: 'mode/set'; mode: ColourMode } // drops a legend filter the new mode's legend does not show
  | { type: 'view/set'; view: ViewMode }
  | { type: 'req/set'; patch: Partial<RequirementDraft> } // merge; clears a 'match' selection
  | { type: 'req/clear' } // min/max/rent → null; keeps includePotential
  | { type: 'ask/apply'; parsed: ParsedQuery } // replaces min/max/rent (absent → null), keeps includePotential; moveInBy → asOf = snapToSlider; clears selection
  | { type: 'noFit/jump'; asOf: ISODate } // asOf + includePotential = true
  | { type: 'select'; selection: Selection }
  | { type: 'highlight/toggle'; kpi: KpiKey }
  | { type: 'scenario/add'; change: Change } // the CALLER validates with applyScenario first
  | { type: 'scenario/reset' }
  | { type: 'shortlist/add'; entry: ShortlistEntry } // no-op if the id exists or 10 entries are held
  | { type: 'shortlist/remove'; id: string }
  | { type: 'building/import'; buildings: Building[] } // append; buildingId = first imported
  | { type: 'building/remove'; buildingId: string } // imported only: drops it and its shortlist; if selected, switches to the first bundled
  | { type: 'overlay/set'; overlay: Overlay }
  | { type: 'floor/set'; floor: number | null } // null leaves floor view; a floor the current building lacks → null
  | { type: 'legend/toggle'; key: FillKey } // the pressed key again clears; a key the colour mode does not show is ignored
  | { type: 'present/set'; on: boolean }
  | { type: 'move/preview'; option: MoveOption | null } // a non-null option also clears floor, highlight and legend; any action that changes what it was computed from ends it
  | { type: 'tour/start'; stops: Candidate[]; index: number; playing: boolean } // no stops: ignored; presents the 3D building, ends floor view, highlight, filter, preview, overlays
  | { type: 'tour/go'; index: number } // another stop (clamped), flown to afresh
  | { type: 'tour/phase'; index: number; phase: TourPhase } // ignored unless `index` is the stop shown
  | { type: 'tour/play'; playing: boolean }
  | { type: 'tour/exit' } // presentation mode stays; the last toured suite is selected
