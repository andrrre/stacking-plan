import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { LineBasicMaterial, type Group } from 'three'
import { FLIGHT_MS, flightAt } from '../moveFlight'
import type { Layout3D } from '../layout3d'
import type { LookColours, Palette } from '../palette'
import type { Shapes } from './resources'
import { SuiteMaterials, type Dim } from './suiteMaterials'
import type { MoveFlightState } from './useMoveFlight'

// The previewed move's block in the air: one opaque box in the match accent (the rings' and rank badges' colour),
// outlined in the accent's ink, flown by flightAt from the old suite to the new one over FLIGHT_MS. It carries no
// label. Rendering is on demand, so it asks for a frame on every frame while it flies; it creates its own
// materials and disposes them.

type Props = {
  flight: MoveFlightState
  layout: Layout3D
  palette: Palette
  shapes: Shapes
}

export function MoveFlight({ flight, layout, palette, shapes }: Props) {
  const { pair, flying, land } = flight
  if (!pair || !flying) return null
  // Keyed by the pair: a new pair is a new flight, from its own start.
  return <Flight key={pair.key} outId={pair.outId} inId={pair.inId} layout={layout} palette={palette} shapes={shapes} onLanded={land} />
}

type FlightProps = Omit<Props, 'flight'> & { outId: string; inId: string; onLanded: () => void }

const SOLID: Dim = { ghost: false, faded: false }
const FLIGHT_KEY = 'move-flight'
/** The ink outline on each face, in screen px: a step bolder than a committed suite's 1.5. */
const EDGE_PX = 2

/** The accent on every face, outlined in its ink: the one thing in the scene drawn in it. */
const flightColours = (p: Palette): LookColours => ({
  base: p.match, side: p.match, pattern: null, edge: { hex: p.matchInk, px: EDGE_PX }, ghostTone: p.surface,
})

/** An opaque box (one SuiteMaterial, the suites' own shading) and its edges in the accent's ink. */
function useFlightMaterials(palette: Palette) {
  const mats = useMemo(() => {
    const box = new SuiteMaterials()
    box.get(FLIGHT_KEY).transparent = false
    return { box, edges: new LineBasicMaterial({ color: palette.matchInk }) }
  }, [palette])
  useEffect(() => () => {
    mats.box.dispose()
    mats.edges.dispose()
  }, [mats])
  return mats
}

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)

function Flight({ outId, inId, layout, palette, shapes, onLanded }: FlightProps) {
  const invalidate = useThree((s) => s.invalidate)
  const mats = useFlightMaterials(palette)
  const colours = useMemo(() => flightColours(palette), [palette])
  const group = useRef<Group>(null)
  const start = useRef<number | null>(null)
  // Ask for the first frame, and for one more once the block is gone (the destination shows in its place).
  useEffect(() => {
    invalidate()
    return () => invalidate()
  }, [invalidate])
  useFrame(() => {
    const g = group.current
    const from = layout.suites.find((b) => b.id === outId)
    const to = layout.suites.find((b) => b.id === inId)
    if (!g || !from || !to) return
    const now = performance.now()
    start.current ??= now
    const k = Math.min((now - start.current) / FLIGHT_MS, 1)
    const b = flightAt(from, to, ease(k))
    g.position.set(b.x, b.y, b.z)
    g.scale.set(b.w, b.h, b.d)
    mats.box.apply(FLIGHT_KEY, colours, SOLID, { ...to, ...b }, null, FLIGHT_KEY)
    if (k < 1) invalidate()
    else onLanded()
  })
  return (
    <group ref={group} dispose={null}>
      <mesh geometry={shapes.box} material={mats.box.get(FLIGHT_KEY)} />
      <lineSegments geometry={shapes.edges} material={mats.edges} />
    </group>
  )
}
