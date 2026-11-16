import type { Building, Change, ISODate, KpiKey, ParsedQuery, ShortlistEntry } from '../../domain/types'
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
