import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { FOV_Y } from './camera'
import { cityDim } from './city/motion'
import { cityPlan } from './city/plan'
import { cityTraffic } from './city/traffic'
import { labelContent } from './labels3d'
import { EXTERIOR_NEAR } from './tourCamera'
import { buildingLayout, buildingSite, floorLayout } from './layout3d'
import { overlayActive, suiteLook } from './palette'
import type { SceneProps, TourStop } from './sceneTypes'
import { Overlay } from './scene/Overlay'
import { createOverlayRefs } from './scene/overlayRefs'
import { COLOUR_MS } from './scene/suiteMaterials'
import { World } from './scene/World'
import { useCityMotion } from './useCityMotion'
import { useReducedMotion } from './useReducedMotion'
import { useTheme } from '../theme/useTheme'
import styles from './three-d.module.css'

// The WebGL building (loaded lazily): a canvas rendered on demand, with an HTML overlay for the labels.

function useDerived(model: SceneProps['model'], focusedId: string | null) {
  return useMemo(() => {
    const all = model.floors.flatMap((f) => f.suites)
    const active = overlayActive(all)
    const looks = new Map(all.map((v) => [v.suite.id, suiteLook(v, active, v.suite.id === focusedId)]))
    return {
      visuals: new Map(all.map((v) => [v.suite.id, v])),
      contents: new Map(all.map((v) => [v.suite.id, labelContent(v)])),
      looks,
      ghosts: new Set([...looks].flatMap(([id, l]) => (l.ghost ? [id] : []))),
      faded: new Set([...looks].flatMap(([id, l]) => (l.faded ? [id] : []))),
    }
  }, [model, focusedId])
}

const SPREAD_MS = 420
/** The city's strength on a suite tour (1: as drawn around the building; its fills and lines grow more opaque). */
const TOUR_CITY = 1.4
const RESIZE = { scroll: false, debounce: 0 } as const

/** 0 (floors together) … 1 (separated), easing between the two over SPREAD_MS; a jump under reduced motion. */
function useSpread(separated: boolean, reduced: boolean): number {
  const goal = separated ? 1 : 0
  const [spread, setSpread] = useState(goal)
  const current = useRef(goal)
  useEffect(() => {
    const from = current.current
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const k = reduced ? 1 : Math.min((now - start) / SPREAD_MS, 1)
      current.current = from + (goal - from) * (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)
      setSpread(current.current)
      if (k < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [goal, reduced])
  return spread
}

/** The city for this building: seeded by its id, sized by its footprint and height with the floors together. */
function useCity(buildingId: string, model: SceneProps['model']) {
  const { halfW, halfD, height } = useMemo(() => buildingSite(model), [model])
  return useMemo(() => {
    const plan = cityPlan(buildingId, { halfW, halfD, height })
    return { plan, traffic: cityTraffic(buildingId, plan) }
  }, [buildingId, halfW, halfD, height])
}

/** Inside a suite on the tour, the floors above it are gone, as in floor view (null: no floor taken away). */
const tourFloor = (tour: SceneProps['tour']) => (tour && tour.phase !== 'fly' ? tour.floor : null)

/**
 * The room the tour's camera is in or going into (enter, look), kept while the camera flies out of it (on to the
 * next stop, or back at the tour's end) until it reports it has left: the floor stays opened and the room drawn
 * around it, so nothing pops back in while the camera is still inside.
 */
function useTourRoom(tour: TourStop | null) {
  const [held, setHeld] = useState<TourStop | null>(null)
  const current = tour && tour.phase !== 'fly' ? tour : null
  if (current && held !== current) setHeld(current)
  const onOutside = useCallback(() => setHeld(null), [])
  return { room: current ?? held, onOutside }
}

/** The camera's layout (the tour's phase decides it) and the one drawn (the room's floor kept open while it is left). */
function useLayouts(model: SceneProps['model'], spread: number, cameraFloor: number | null, shownFloor: number | null) {
  // Floor view ignores the spread, so a floors-moving animation does not rebuild its layout every step.
  const wholeSpread = cameraFloor === null ? spread : 0
  const layout = useMemo(
    () => (cameraFloor === null ? buildingLayout(model, wholeSpread) : floorLayout(model, cameraFloor)), [model, wholeSpread, cameraFloor],
  )
  const shown = useMemo(
    () => (shownFloor === cameraFloor || shownFloor === null ? layout : floorLayout(model, shownFloor)), [model, layout, cameraFloor, shownFloor],
  )
  return { layout, shown }
}

function Scene3D({ buildingId, model, mode, separated, floor, focusedId, city, wide, rig, onSelect, onPoints, onLost, tour = null, onTourPhase, onTourLook }: SceneProps) {
  const reduced = useReducedMotion()
  const { theme } = useTheme()
  const spread = useSpread(separated, reduced)
  const root = useRef<HTMLDivElement>(null)
  const running = useCityMotion(root, city, reduced)
  const town = useCity(buildingId, model)
  // Floor view and separated floors push the city further back, so the floor being read stands clear. The tour
  // draws it a little stronger than usual: it is the view out of the suite's windows.
  const dim = tour ? TOUR_CITY : cityDim(floor, spread)
  const { room, onOutside } = useTourRoom(tour)
  const { layout, shown } = useLayouts(model, spread, tourFloor(tour) ?? floor, room?.floor ?? floor)
  const derived = useDerived(model, focusedId)
  const [refs] = useState(createOverlayRefs)
  return (
    <div ref={root} className={styles.scene} data-testid="scene3d" data-theme={theme} data-labels={shown.onTop ? 'top' : 'front'} data-floor-view={String(shown.focus !== null)}
      data-floors-moving={String(spread > 0 && spread < 1)} data-colour-transition-ms={reduced ? 0 : COLOUR_MS}
      data-city={city ? 'on' : 'off'} data-city-motion={running ? 'on' : 'off'}
      data-city-dim={city ? dim.toFixed(2) : undefined} data-tour-phase={tour?.phase} data-tour-room={room ? 'in' : undefined}>
      <Canvas
        className={styles.canvas}
        aria-hidden="true"
        flat
        frameloop="demand"
        dpr={[1, 2]}
        // Follow the stage's size every frame while a side drawer slides (the default debounces resizes by
        // 50 ms, so the canvas would stay its old size, clipped or short, until the slide ended). Pointer
        // events use offsetX/Y, so the scroll tracking the default adds is not needed.
        resize={RESIZE}
        camera={{ fov: FOV_Y, near: EXTERIOR_NEAR, far: 2000, position: [0, 6, 60] }}
        gl={{ antialias: true, alpha: true }}
      >
        <World
          {...derived} mode={mode} theme={theme} layout={shown} frame={layout} spread={spread} focusedId={focusedId} reduced={reduced} wide={wide}
          refs={refs} rig={rig} onSelect={onSelect} onPoints={onPoints} onLost={onLost}
          city={city ? { ...town, running, dim, strong: room !== null && theme === 'light' } : null} tour={tour} room={room} onTourPhase={onTourPhase} onTourLook={onTourLook} onTourOutside={onOutside}
        />
      </Canvas>
      <Overlay layout={shown} visuals={derived.visuals} contents={derived.contents} ghosts={derived.ghosts} refs={refs} />
      {/* The furniture and people inside are a staged test fit, never the suite's real layout or its occupants. */}
      {room && <p className={styles.fitTag} data-testid="fitout-tag">Illustrative fit-out · not the actual layout</p>}
    </div>
  )
}

export default memo(Scene3D)
