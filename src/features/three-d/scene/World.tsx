import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import type { Group } from 'three'
import type { ColourMode } from '../../../app/state/types'
import type { Theme } from '../../theme/themeStorage'
import { DEFAULT_VIEW, FLOOR_VIEW, SEPARATED_VIEW, lerpView } from '../camera'
import type { LabelContent } from '../labels3d'
import type { Layout3D } from '../layout3d'
import { readPalette, type SuiteLook } from '../palette'
import type { Rig, ScreenPoint } from '../sceneTypes'
import type { SuiteVisual } from '../../stack/suiteVisual'
import { Ground, Suites } from './Building'
import { CameraRig } from './CameraRig'
import { City, type CityScene } from './City'
import { useContextWatch, usePicker, useFrameSync } from './interaction'
import type { OverlayRefs } from './overlayRefs'
import { useSharedGeometry } from './resources'
import { SuiteMaterials } from './suiteMaterials'

// Everything inside the <Canvas>: camera rig, ground, building, picking, the overlay sync and the city. The
// city is not in the picking group and plays no part in the framing (the rig frames the building's bounds).

export type WorldProps = {
  mode: ColourMode
  theme: Theme // the palette is read again, and the frame redrawn, when it changes
  layout: Layout3D
  visuals: ReadonlyMap<string, SuiteVisual>
  contents: ReadonlyMap<string, LabelContent>
  looks: ReadonlyMap<string, SuiteLook>
  ghosts: ReadonlySet<string>
  faded: ReadonlySet<string> // left out by the legend filter
  spread: number // 0 floors together … 1 separated
  focusedId: string | null
  reduced: boolean
  wide?: boolean // the stage's settled layout (see useStageWide); unset: from the canvas's own aspect
  refs: OverlayRefs
  rig: RefObject<Rig | null>
  onSelect: (id: string) => void
  onPoints: (p: ReadonlyMap<string, ScreenPoint>) => void
  onLost: () => void // the WebGL context was lost and did not come back
  city: CityScene | null // the sketched city around the building (null: the plain stage)
}

/**
 * Reads the tokens as resolved colours: each is set as a hidden probe's colour and read back computed, so
 * light-dark() and nested var()s resolve for the theme the page is showing.
 */
function readTokens() {
  const probe = document.createElement('span')
  probe.hidden = true
  document.body.append(probe)
  try {
    return readPalette((name) => {
      probe.style.setProperty('color', `var(${name})`)
      return getComputedStyle(probe).color
    })
  } finally {
    probe.remove()
  }
}

export function World(p: WorldProps) {
  const { mode, theme, layout, visuals, contents, looks, ghosts, faded, refs, onSelect, onPoints, focusedId, reduced } = p
  // The tokens are read once, and again when the colour mode or the theme changes (the new palette rebuilds the
  // materials, which invalidate the frame).
  const palette = useMemo(() => {
    void mode
    void theme
    return readTokens()
  }, [mode, theme])
  const shapes = useSharedGeometry()
  const mats = useMemo(() => new SuiteMaterials(), [])
  useEffect(() => () => mats.dispose(), [mats])
  const group = useRef<Group>(null)
  const hover = useRef<string | null>(null)
  const animateAt = useCallback(() => (reduced ? null : performance.now()), [reduced])
  const pick = useMemo(() => ({ group, hover, mats, tooltip: refs.tooltip, visuals, onSelect }), [mats, refs, visuals, onSelect])
  usePicker(pick)
  useContextWatch(p.onLost)
  useFrameSync({ layout, visuals, contents, ghosts, faded, refs, focusedId, hover, mats, group, onPoints })
  const focus = layout.focus?.floor ?? null
  // The framing angle: floor view's own, or part-way between the default and the separated view.
  const view = useMemo(() => (focus === null ? lerpView(DEFAULT_VIEW, SEPARATED_VIEW, p.spread) : FLOOR_VIEW), [focus, p.spread])
  return (
    <>
      <CameraRig bounds={layout.focus?.bounds ?? layout.bounds} view={view} focus={focus} reduced={reduced} wide={p.wide} rig={p.rig} />
      {p.city && <City {...p.city} palette={palette} shapes={shapes} />}
      <Ground bounds={layout.bounds} shapes={shapes} shadow={palette.shadow} />
      <Suites layout={layout} looks={looks} palette={palette} mats={mats} shapes={shapes} group={group} animateAt={animateAt} />
    </>
  )
}
