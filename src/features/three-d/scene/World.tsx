import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Group } from 'three'
import type { ColourMode, TourPhase } from '../../../app/state/types'
import type { Theme } from '../../theme/themeStorage'
import { DEFAULT_VIEW, FLOOR_VIEW, SEPARATED_VIEW, lerpView } from '../camera'
import type { LabelContent } from '../labels3d'
import { boundsKey, type Layout3D } from '../layout3d'
import { readPalette, type SuiteLook } from '../palette'
import type { Rig, ScreenPoint } from '../sceneTypes'
import type { SuiteVisual } from '../../stack/suiteVisual'
import { Ground, Suites } from './Building'
import { CameraRig } from './CameraRig'
import { City, type CityScene } from './City'
import { useContextWatch, usePicker, useFrameSync } from './interaction'
import { MoveFlight } from './MoveFlight'
import type { OverlayRefs } from './overlayRefs'
import { useSharedGeometry } from './resources'
import { SuiteMaterials } from './suiteMaterials'
import { useMoveFlight } from './useMoveFlight'
import type { TourCue } from './useTourCamera'
import { TourRoom } from './TourRoom'
import { footprint, type Footprint } from '../tourCamera'
import type { TourStop } from '../sceneTypes'

// Everything inside the <Canvas>: camera rig, ground, building, picking, the overlay sync and the city. The
// city is not in the picking group and plays no part in the framing (the rig frames the building's bounds).

export type WorldProps = {
  mode: ColourMode
  theme: Theme // the palette is read again, and the frame redrawn, when it changes
  layout: Layout3D // what is drawn
  frame?: Layout3D // what the camera frames and the tour's flights aim at (default: `layout`); on a suite tour the
  // drawn layout keeps the room's floor open while the camera leaves it
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
  tour?: TourStop | null // the suite tour's stop (null: no tour)
  room?: TourStop | null // the stop whose room the camera is in, going into or leaving (drawn from inside)
  onTourPhase?: (index: number, phase: TourPhase) => void
  onTourLook?: () => void
  onTourOutside?: () => void
}

/**
 * What the camera rig needs of the tour's stop: its floor area (from the layout's boxes) and the building's
 * bounds. Kept the same object while those numbers stand, so a new layout (the floors above hidden as the
 * camera goes in) does not restart the stop's flight.
 */
function useTourCue(tour: TourStop | null, layout: Layout3D): TourCue | null {
  const foot = tour ? footprint(layout.suites.filter((b) => tour.suiteIds.includes(b.id))) : null
  const key = tour && foot ? `${tour.index}|${tour.phase}|${Object.values(foot).map((n) => n.toFixed(3)).join()}|${boundsKey(layout.bounds)}` : ''
  const [kept, setKept] = useState<{ key: string; cue: TourCue | null }>({ key: '', cue: null })
  if (kept.key === key) return kept.cue
  const cue = tour && foot ? { index: tour.index, phase: tour.phase, foot, building: layout.bounds } : null
  setKept({ key, cue })
  return cue
}

const NO_ROOM = { foot: null, inside: new Set<string>() }

/** The tour room's floor area in the drawn layout, and its suites (drawn from inside, not as boxes). */
function useRoom(room: TourStop | null, layout: Layout3D): { foot: Footprint | null; inside: ReadonlySet<string> } {
  return useMemo(() => {
    if (!room) return NO_ROOM
    const foot = footprint(layout.suites.filter((b) => room.suiteIds.includes(b.id)))
    return foot ? { foot, inside: new Set(room.suiteIds) } : NO_ROOM
  }, [room, layout])
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
  const quiet = Boolean(p.tour)
  const pick = useMemo(() => ({ group, hover, mats, tooltip: refs.tooltip, visuals, onSelect, quiet }), [mats, refs, visuals, onSelect, quiet])
  usePicker(pick)
  useEffect(() => { // a tour starting under the pointer leaves no hover or tooltip behind
    if (!quiet) return
    hover.current = null
    mats.setHover(null)
    refs.tooltip.current?.toggleAttribute('hidden', true)
  }, [quiet, mats, refs])
  useContextWatch(p.onLost)
  const flight = useMoveFlight(visuals, layout, reduced)
  const hidden = flight.flying && flight.pair ? flight.pair.inId : null // until the block lands
  useFrameSync({ layout, visuals, contents, ghosts, faded, refs, focusedId, hover, mats, group, onPoints, hidden })
  const framed = p.frame ?? layout
  const focus = framed.focus?.floor ?? null
  // The framing angle: floor view's own, or part-way between the default and the separated view.
  const view = useMemo(() => (focus === null ? lerpView(DEFAULT_VIEW, SEPARATED_VIEW, p.spread) : FLOOR_VIEW), [focus, p.spread])
  const cue = useTourCue(p.tour ?? null, framed)
  const room = useRoom(p.room ?? null, layout)
  const roomFill = palette.fills[looks.get(p.room?.suiteIds[0] ?? '')?.fill ?? 'vacant']
  return (
    <>
      <CameraRig
        bounds={framed.focus?.bounds ?? framed.bounds} view={view} focus={focus} reduced={reduced} wide={p.wide} rig={p.rig}
        tour={cue} room={room.foot} onTourPhase={p.onTourPhase} onTourLook={p.onTourLook} onTourOutside={p.onTourOutside}
      />
      {p.city && <City {...p.city} palette={palette} shapes={shapes} />}
      <Ground bounds={layout.bounds} shapes={shapes} shadow={palette.shadow} />
      <Suites layout={layout} looks={looks} palette={palette} mats={mats} shapes={shapes} group={group} animateAt={animateAt} hidden={hidden} inside={room.inside} />
      {room.foot && <TourRoom foot={room.foot} fill={roomFill} palette={palette} shapes={shapes} />}
      <MoveFlight flight={flight} layout={layout} palette={palette} shapes={shapes} />
    </>
  )
}
