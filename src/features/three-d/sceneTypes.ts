import type { RefObject } from 'react'
import type { ColourMode, TourPhase } from '../../app/state/types'
import type { StackModel } from '../stack/suiteVisual'

// The contract between the eager 3D shell (mirror, controls, fallback) and the lazily loaded WebGL scene.

/** Camera commands the control buttons send to the scene. */
export type Rig = { reset: () => void; rotate: (degrees: number) => void; zoom: (factor: number) => void }

/** Where a suite's front face centre is on the canvas (CSS px from its top-left), and whether a click there hits it. */
/** A suite's label-face centre on the canvas, whether a click there lands on it, and the face's corners (tests). */
export type ScreenPoint = { x: number; y: number; hit: boolean; face: string }

/** The suite tour's stop as the scene sees it: which stop, how far in, its suites and floor. */
export type TourStop = { index: number; phase: TourPhase; suiteIds: readonly string[]; floor: number }

export type SceneProps = {
  buildingId: string // seeds the sketched city around the building
  model: StackModel
  mode: ColourMode
  separated: boolean
  floor: number | null // floor view: the floor shown (null: the whole building)
  focusedId: string | null
  city: boolean // the City switch: the sketched neighbourhood and its traffic around the building
  wide: boolean // the stage's layout: controls down the right (see useStageWide)
  rig: RefObject<Rig | null>
  onSelect: (suiteId: string) => void
  onPoints: (points: ReadonlyMap<string, ScreenPoint>) => void
  onLost: () => void // the WebGL context was lost and did not come back
  tour?: TourStop | null // the suite tour's stop (null: no tour)
  onTourPhase?: (index: number, phase: TourPhase) => void // the camera arrived: the stop's next phase
  onTourLook?: () => void // the user dragged to look about inside
}
