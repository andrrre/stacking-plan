import type { RefObject } from 'react'
import type { ColourMode } from '../../app/state/types'
import type { StackModel } from '../stack/suiteVisual'

// The contract between the eager 3D shell (mirror, controls, fallback) and the lazily loaded WebGL scene.

/** Camera commands the control buttons send to the scene. */
export type Rig = { reset: () => void; rotate: (degrees: number) => void; zoom: (factor: number) => void }

/** Where a suite's front face centre is on the canvas (CSS px from its top-left), and whether a click there hits it. */
export type ScreenPoint = { x: number; y: number; hit: boolean }

export type SceneProps = {
  model: StackModel
  mode: ColourMode
  separated: boolean
  focusedId: string | null
  rig: RefObject<Rig | null>
  onSelect: (suiteId: string) => void
  onPoints: (points: ReadonlyMap<string, ScreenPoint>) => void
  onLost: () => void // the WebGL context was lost and did not come back
}
