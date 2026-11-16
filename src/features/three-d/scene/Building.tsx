import { useEffect, useLayoutEffect, useMemo, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import {
  DataTexture, LineBasicMaterial, LinearFilter, MeshBasicMaterial, SRGBColorSpace, type Group,
} from 'three'
import { lookColours, lookKey, type Palette, type Rgba, type SuiteLook } from '../palette'
import type { Bounds, Layout3D } from '../layout3d'
import type { Shapes } from './resources'
import { SuiteMaterial } from './suiteMaterial'
import type { SuiteMaterials } from './suiteMaterials'

// The meshes: suite boxes with crisp edges, floor slabs, roof caps, a base plinth and a soft contact
// shadow. Ghosted suites draw no edges (they would show through the translucent boxes). Geometries are
// shared unit shapes scaled per object; everything created here is disposed here. Suites the legend filter
// fades draw no edges either.

function useLineMaterials(p: Palette) {
  const mats = useMemo(() => ({
    solid: new LineBasicMaterial({ color: p.roofEdge, transparent: true, opacity: 0.9 }),
    slab: new LineBasicMaterial({ color: p.roofEdge, transparent: true, opacity: 0.9 }),
  }), [p])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  return mats
}

type SuitesProps = {
  layout: Layout3D
  looks: ReadonlyMap<string, SuiteLook>
  palette: Palette
  mats: SuiteMaterials
  shapes: Shapes
  group: RefObject<Group | null>
  animateAt: () => number | null
  hidden?: string | null // a suite not drawn (the previewed move's destination, until its block lands)
  inside?: ReadonlySet<string> // suites drawn from inside instead (a suite tour's stop: see TourRoom)
}

const NONE: ReadonlySet<string> = new Set()

export function Suites({ layout, looks, palette, mats, shapes, group, animateAt, hidden = null, inside = NONE }: SuitesProps) {
  const invalidate = useThree((s) => s.invalidate)
  const lines = useLineMaterials(palette)
  useLayoutEffect(() => {
    const at = animateAt()
    for (const b of layout.suites) {
      const look = looks.get(b.id)
      if (look) mats.apply(b.id, lookColours(look, palette), look, b, at, lookKey(look))
    }
    mats.retain(new Set(layout.suites.map((b) => b.id)))
    invalidate()
  }, [layout, looks, palette, mats, animateAt, invalidate])
  return (
    <>
      <group ref={group}>
        {layout.suites.map((b) => (
          <mesh key={b.id} dispose={null} geometry={shapes.box} material={mats.get(b.id)} visible={b.id !== hidden && !inside.has(b.id)} position={[b.x, b.y, b.z]} scale={[b.w, b.h, b.d]} userData={{ suiteId: b.id }} />
        ))}
      </group>
      {layout.suites.map((b) => (
        <lineSegments
          key={b.id} dispose={null} geometry={shapes.edges} material={lines.solid} visible={!looks.get(b.id)?.ghost && !looks.get(b.id)?.faded && b.id !== hidden && !inside.has(b.id)}
          position={[b.x, b.y, b.z]} scale={[b.w, b.h, b.d]}
        />
      ))}
      <Slabs layout={layout} palette={palette} shapes={shapes} line={lines.slab} />
    </>
  )
}

function neutral(hex: string, side: string): SuiteMaterial {
  const m = new SuiteMaterial()
  m.color.set(hex)
  m.u.uSide.value.set(side)
  m.transparent = false
  return m
}

/** Slabs and roof caps in the roof neutral (their sides in its edge tone), the plinth in the edge tone. */
function Slabs({ layout, palette, shapes, line }: { layout: Layout3D; palette: Palette; shapes: Shapes; line: LineBasicMaterial }) {
  const mats = useMemo(() => ({ slab: neutral(palette.roof, palette.roofEdge), base: neutral(palette.roofEdge, palette.roofEdge) }), [palette])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  const p = layout.plinth
  return (
    <>
      {[...layout.slabs.map((s) => ['slab', s] as const), ...layout.caps.map((s) => ['cap', s] as const)].map(([kind, s]) => (
        <group key={`${kind}-${s.floor}`} dispose={null} position={[s.x, s.y, s.z]} scale={[s.w, s.h, s.d]}>
          <mesh geometry={shapes.box} material={mats.slab} />
          <lineSegments geometry={shapes.edges} material={line} />
        </group>
      ))}
      <group dispose={null} position={[p.x, p.y, p.z]} scale={[p.w, p.h, p.d]}>
        <mesh geometry={shapes.box} material={mats.base} />
        <lineSegments geometry={shapes.edges} material={line} />
      </group>
    </>
  )
}

const SHADOW_PX = 64
/** The light theme's --c-shadow alpha (.12) times this is the 0.3 peak the contact shadow was drawn at. */
const SHADOW_GAIN = 2.5

/** A radial falloff computed once into a small texture (white, the falloff in alpha): the contact shadow's shape. */
function shadowTexture(): DataTexture {
  const data = new Uint8Array(SHADOW_PX * SHADOW_PX * 4)
  const mid = (SHADOW_PX - 1) / 2
  for (let i = 0; i < SHADOW_PX * SHADOW_PX; i++) {
    const r = Math.hypot((i % SHADOW_PX) - mid, Math.floor(i / SHADOW_PX) - mid) / mid
    const a = Math.max(0, 1 - r) ** 1.6
    data.set([255, 255, 255, Math.round(a * 255)], i * 4)
  }
  const t = new DataTexture(data, SHADOW_PX, SHADOW_PX)
  t.colorSpace = SRGBColorSpace
  t.magFilter = LinearFilter
  t.minFilter = LinearFilter
  t.needsUpdate = true
  return t
}

/** The soft contact shadow under the building, in the theme's --c-shadow colour and strength. */
export function Ground({ bounds, shapes, shadow }: { bounds: Bounds; shapes: Shapes; shadow: Rgba }) {
  const texture = useMemo(() => shadowTexture(), [])
  useEffect(() => () => texture.dispose(), [texture])
  const material = useMemo(() => new MeshBasicMaterial({
    map: texture, color: shadow.hex, opacity: Math.min(1, shadow.alpha * SHADOW_GAIN), transparent: true, depthWrite: false,
  }), [texture, shadow])
  useEffect(() => () => material.dispose(), [material])
  const w = (bounds.max[0] - bounds.min[0]) * 1.35
  const d = (bounds.max[2] - bounds.min[2]) * 2.6
  return <mesh dispose={null} geometry={shapes.plane} material={material} rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} scale={[w, d, 1]} renderOrder={-1} />
}
