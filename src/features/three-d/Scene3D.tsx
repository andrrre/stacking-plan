import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { FOV_Y } from './camera'
import { labelContent } from './labels3d'
import { buildingLayout, floorLayout } from './layout3d'
import { overlayActive, suiteLook } from './palette'
import type { SceneProps } from './sceneTypes'
import { Overlay } from './scene/Overlay'
import { createOverlayRefs } from './scene/overlayRefs'
import { COLOUR_MS } from './scene/suiteMaterials'
import { World } from './scene/World'
import { useReducedMotion } from './useReducedMotion'
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
    }
  }, [model, focusedId])
}

const SPREAD_MS = 420

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

function Scene3D({ model, mode, separated, floor, focusedId, rig, onSelect, onPoints, onLost }: SceneProps) {
  const reduced = useReducedMotion()
  const spread = useSpread(separated, reduced)
  // Floor view ignores the spread, so a floors-moving animation does not rebuild its layout every step.
  const wholeSpread = floor === null ? spread : 0
  const layout = useMemo(() => (floor === null ? buildingLayout(model, wholeSpread) : floorLayout(model, floor)), [model, wholeSpread, floor])
  const derived = useDerived(model, focusedId)
  const [refs] = useState(createOverlayRefs)
  return (
    <div className={styles.scene} data-testid="scene3d" data-labels={layout.onTop ? 'top' : 'front'} data-floor-view={String(layout.focus !== null)}
      data-floors-moving={String(spread > 0 && spread < 1)} data-colour-transition-ms={reduced ? 0 : COLOUR_MS}>
      <Canvas
        className={styles.canvas}
        aria-hidden="true"
        flat
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: FOV_Y, near: 0.5, far: 2000, position: [0, 6, 60] }}
        gl={{ antialias: true, alpha: true }}
      >
        <World
          {...derived} mode={mode} layout={layout} spread={spread} focusedId={focusedId} reduced={reduced}
          refs={refs} rig={rig} onSelect={onSelect} onPoints={onPoints} onLost={onLost}
        />
      </Canvas>
      <Overlay layout={layout} visuals={derived.visuals} contents={derived.contents} ghosts={derived.ghosts} refs={refs} />
    </div>
  )
}

export default memo(Scene3D)
