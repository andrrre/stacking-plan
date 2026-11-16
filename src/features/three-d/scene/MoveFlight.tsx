import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { LineBasicMaterial, type Group } from 'three'
import { FLIGHT_MS, flightAt } from '../moveFlight'
import type { Layout3D } from '../layout3d'
import { lookColours, lookKey, type Palette, type SuiteLook } from '../palette'
import type { Shapes } from './resources'
import { SuiteMaterials, type Dim } from './suiteMaterials'
import type { MoveFlightState } from './useMoveFlight'

// The previewed move's block in the air: one opaque box in the destination suite's (the tenant's) colours, with
// edges, flown by flightAt from the old suite to the new one over FLIGHT_MS. It carries no label. Rendering is
// on demand, so it asks for a frame on every frame while it flies; it creates its own materials and disposes them.

type Props = {
  flight: MoveFlightState
  layout: Layout3D
  looks: ReadonlyMap<string, SuiteLook>
  palette: Palette
  shapes: Shapes
}

export function MoveFlight({ flight, layout, looks, palette, shapes }: Props) {
  const { pair, flying, land } = flight
  const look = pair ? looks.get(pair.inId) : undefined
  if (!pair || !flying || !look) return null
  // Keyed by the pair: a new pair is a new flight, from its own start.
  return <Flight key={pair.key} outId={pair.outId} inId={pair.inId} layout={layout} look={look} palette={palette} shapes={shapes} onLanded={land} />
}

type FlightProps = Omit<Props, 'flight' | 'looks'> & { outId: string; inId: string; look: SuiteLook; onLanded: () => void }

const SOLID: Dim = { ghost: false, faded: false }

/** The tenant's colours on an opaque box (one SuiteMaterial, the suites' own shading), and edges as the suites draw them. */
function useFlightMaterials(palette: Palette, id: string) {
  const mats = useMemo(() => {
    const box = new SuiteMaterials()
    box.get(id).transparent = false
    return { box, edges: new LineBasicMaterial({ color: palette.roofEdge, transparent: true, opacity: 0.9 }) }
  }, [palette, id])
  useEffect(() => () => {
    mats.box.dispose()
    mats.edges.dispose()
  }, [mats])
  return mats
}

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)

function Flight({ outId, inId, layout, look, palette, shapes, onLanded }: FlightProps) {
  const invalidate = useThree((s) => s.invalidate)
  const mats = useFlightMaterials(palette, inId)
  const colours = useMemo(() => lookColours(look, palette), [look, palette])
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
    mats.box.apply(inId, colours, SOLID, { ...to, ...b }, null, lookKey(look))
    if (k < 1) invalidate()
    else onLanded()
  })
  return (
    <group ref={group} dispose={null}>
      <mesh geometry={shapes.box} material={mats.box.get(inId)} />
      <lineSegments geometry={shapes.edges} material={mats.edges} />
    </group>
  )
}
