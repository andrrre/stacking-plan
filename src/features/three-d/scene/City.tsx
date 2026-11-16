import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BoxGeometry, BufferGeometry, CapsuleGeometry, Color, Float32BufferAttribute, Object3D, type InstancedMesh } from 'three'
import { nextTick, type Tick } from '../city/motion'
import { roadRects, type Block, type CityPlan } from '../city/plan'
import { blockSegments, flatten, roadSegments, treeSegments } from '../city/sketch'
import { CAR, PERSON, poseAt, type Mover, type Traffic } from '../city/traffic'
import type { Palette } from '../palette'
import { depthMaterial, fadeUniforms, fillMaterial, flatMaterial, lineMaterial, setFade, shadeByNormal, type FadeUniforms } from './cityMaterials'
import type { Shapes } from './resources'

// The sketched city: pale see-through neighbour blocks with thin outlines, trees, road surfaces with kerbs and
// lane dashes, and a few cars and people moving on them. All of it sits outside the picking group. Draw order
// (renderOrder; the building is at 0): roads (-4) under everything, writing no depth; then, after the building,
// the block fills (1, no depth), the blocks' depth alone (2, so lines behind a block hide but the building does
// not), the lines (3) and the traffic (4), which blends over the building where it passes in front. Nothing in
// the city writes depth before the building, so it can never punch a hole in it. Everything created here is
// disposed here, including each instanced mesh's own buffers; geometry and materials survive a context loss
// (three uploads them again). The traffic moves on its own throttled loop only while `running`; otherwise it
// stands still where the clock stopped.

export type CityScene = { plan: CityPlan; traffic: Traffic; running: boolean; dim: number }

const NO_HIT = () => undefined // never picked: the facade under a car or a block is still the building's

const lines = (segs: Float32Array) => {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(segs, 3))
  return g
}

/** Far blocks first, so a nearer see-through fill blends over (and hides the lines of) the ones behind it. */
const farFirst = (bs: readonly Block[]) => [...bs].sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z))

const tmp = new Object3D()

/** Frees an instanced mesh's own buffers (instance matrices, colours) when it is replaced or unmounted. */
function useMeshDisposal(ref: RefObject<InstancedMesh | null>, geometry: unknown, material: unknown, count: number): void {
  useEffect(() => {
    void geometry
    void material
    void count
    const mesh = ref.current
    return () => mesh?.dispose()
  }, [ref, geometry, material, count])
}

type BlocksProps = { blocks: readonly Block[]; fill: ReturnType<typeof fillMaterial>; depth: ReturnType<typeof depthMaterial> }

function Blocks({ blocks, fill, depth }: BlocksProps) {
  const fills = useRef<InstancedMesh>(null)
  const depths = useRef<InstancedMesh>(null)
  const box = useMemo(() => shadeByNormal(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), [])
  useEffect(() => () => box.dispose(), [box])
  useMeshDisposal(fills, box, fill, blocks.length)
  useMeshDisposal(depths, box, depth, blocks.length)
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    farFirst(blocks).forEach((b, i) => {
      tmp.position.set(b.x, 0, b.z)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.set(b.w, b.h, b.d)
      tmp.updateMatrix()
      fills.current?.setMatrixAt(i, tmp.matrix)
      depths.current?.setMatrixAt(i, tmp.matrix)
    })
    for (const m of [fills.current, depths.current]) if (m) m.instanceMatrix.needsUpdate = true
    invalidate()
  }, [blocks, fill, depth, invalidate]) // a new material (colour mode) makes a new mesh, which needs its matrices again
  const props = { dispose: null, raycast: NO_HIT, frustumCulled: false }
  return (
    <>
      <instancedMesh key={`f${blocks.length}`} ref={fills} args={[box, fill, blocks.length]} {...props} renderOrder={1} />
      <instancedMesh key={`d${blocks.length}`} ref={depths} args={[box, depth, blocks.length]} {...props} renderOrder={2} />
    </>
  )
}

type SketchProps = { plan: CityPlan; palette: Palette; shapes: Shapes; u: FadeUniforms }

/** The still part of the city: roads, neighbour blocks, trees. */
function Sketch({ plan, palette, shapes, u }: SketchProps) {
  const mats = useMemo(() => ({
    road: flatMaterial(palette.border, 0.42, u),
    fill: fillMaterial(palette.surface, 0.62, u, false),
    depth: depthMaterial(u),
    ink: lineMaterial(palette.muted, 0.42, u),
    kerb: lineMaterial(palette.muted, 0.24, u),
  }), [palette, u])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  const geo = useMemo(() => ({
    ink: lines(flatten([...plan.blocks.flatMap(blockSegments), ...plan.trees.flatMap(treeSegments)])),
    kerb: lines(flatten(roadSegments(plan.roads))),
  }), [plan])
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])
  const rects = useMemo(() => roadRects(plan.roads), [plan])
  return (
    <>
      {rects.map((r) => (
        <mesh
          key={`${r.x0},${r.z0}`} dispose={null} geometry={shapes.plane} material={mats.road} raycast={NO_HIT} renderOrder={-4}
          rotation-x={-Math.PI / 2} position={[(r.x0 + r.x1) / 2, -0.02, (r.z0 + r.z1) / 2]} scale={[r.x1 - r.x0, r.z1 - r.z0, 1]}
        />
      ))}
      <Blocks blocks={plan.blocks} fill={mats.fill} depth={mats.depth} />
      <lineSegments dispose={null} geometry={geo.kerb} material={mats.kerb} raycast={NO_HIT} renderOrder={3} />
      <lineSegments dispose={null} geometry={geo.ink} material={mats.ink} raycast={NO_HIT} renderOrder={3} />
    </>
  )
}

/**
 * The city's clock: while `running`, ticks about 30 times a second (requestAnimationFrame, throttled) and asks
 * for a frame each tick; stopped, it holds its time and requests nothing. The effect's cleanup cancels the
 * loop, so a StrictMode remount cannot leave two running. The canvas's `data-city-ticks` counts the ticks, so
 * a test can tell the city's frames from any other.
 */
function useCityClock(running: boolean): RefObject<Tick> {
  const invalidate = useThree((s) => s.invalidate)
  const canvas = useThree((s) => s.gl.domElement)
  const clock = useRef<Tick>({ at: 0, elapsed: 0 })
  useEffect(() => {
    if (!running) return
    clock.current = { ...clock.current, at: performance.now() }
    let frame = 0
    let ticks = Number(canvas.getAttribute('data-city-ticks')) || 0
    const step = (now: number) => {
      const next = nextTick(clock.current, now)
      if (next) {
        clock.current = next
        ticks += 1
        canvas.setAttribute('data-city-ticks', String(ticks))
        invalidate()
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [running, invalidate, canvas])
  return clock
}

/** Size of a part (x, y, z), its centre's height, and how far forward of the mover's centre it sits. */
type Part = { size: [number, number, number]; y: number; ahead: number }

const BODY: Part = { size: [CAR.width, CAR.body, CAR.length], y: 0.03 + CAR.body / 2, ahead: 0 }
const CABIN: Part = { size: [CAR.width * 0.84, CAR.cabin, CAR.length * 0.5], y: CAR.top - CAR.cabin / 2, ahead: -0.07 }
const FIGURE: Part = { size: [1, 1, 1], y: 0, ahead: 0 }

function place(mesh: InstancedMesh, movers: readonly Mover[], t: number, part: Part): void {
  movers.forEach((m, i) => {
    const p = poseAt(m, t)
    const k = p.scale
    tmp.position.set(p.x + Math.sin(p.heading) * part.ahead, part.y * k, p.z + Math.cos(p.heading) * part.ahead)
    tmp.rotation.set(0, p.heading, 0)
    tmp.scale.set(part.size[0] * k, part.size[1] * k, part.size[2] * k)
    tmp.updateMatrix()
    mesh.setMatrixAt(i, tmp.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
}

function paint(mesh: InstancedMesh, movers: readonly Mover[], tones: readonly Color[]): void {
  movers.forEach((m, i) => mesh.setColorAt(i, tones[m.tone % tones.length] ?? new Color()))
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

const mix = (a: string, b: string, t: number) => new Color(a).lerp(new Color(b), t)

type LifeProps = { traffic: Traffic; palette: Palette; u: FadeUniforms; running: boolean }

/** Cars (a body and a cabin) and people (capsules), one instanced draw per part. */
function Life({ traffic, palette, u, running }: LifeProps) {
  const clock = useCityClock(running)
  const geo = useMemo(() => ({
    box: shadeByNormal(new BoxGeometry(1, 1, 1)),
    person: shadeByNormal(new CapsuleGeometry(PERSON.radius, PERSON.height - 2 * PERSON.radius, 2, 6).translate(0, PERSON.height / 2, 0)),
  }), [])
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])
  const mats = useMemo(() => ({ car: fillMaterial('#ffffff', 0.9, u), person: fillMaterial('#ffffff', 0.85, u) }), [u])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  const body = useRef<InstancedMesh>(null)
  const cabin = useRef<InstancedMesh>(null)
  const people = useRef<InstancedMesh>(null)
  const drawn = useRef<{ t: number; traffic: Traffic | null }>({ t: -1, traffic: null })
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    const cars = [new Color(palette.borderStrong), mix(palette.borderStrong, palette.muted, 0.35), mix(palette.border, palette.borderStrong, 0.5)]
    if (body.current) paint(body.current, traffic.cars, cars)
    if (cabin.current) paint(cabin.current, traffic.cars, cars.map((c) => c.clone().lerp(new Color(palette.surface), 0.35)))
    if (people.current) paint(people.current, traffic.people, [mix(palette.muted, palette.borderStrong, 0.2), mix(palette.muted, palette.borderStrong, 0.5), new Color(palette.muted)])
    drawn.current = { t: -1, traffic: null } // the meshes may be new: place everything on the next frame
    invalidate()
  }, [traffic, palette, geo, mats, invalidate])
  useMeshDisposal(body, geo.box, mats.car, traffic.cars.length)
  useMeshDisposal(cabin, geo.box, mats.car, traffic.cars.length)
  useMeshDisposal(people, geo.person, mats.person, traffic.people.length)
  useFrame(() => {
    const t = clock.current.elapsed
    if (drawn.current.t === t && drawn.current.traffic === traffic) return
    drawn.current = { t, traffic }
    if (body.current) place(body.current, traffic.cars, t, BODY)
    if (cabin.current) place(cabin.current, traffic.cars, t, CABIN)
    if (people.current) place(people.current, traffic.people, t, FIGURE)
  })
  const props = { dispose: null, raycast: NO_HIT, frustumCulled: false, renderOrder: 4 } // after the building: see the header
  return (
    <>
      <instancedMesh key={`b${traffic.cars.length}`} ref={body} args={[geo.box, mats.car, traffic.cars.length]} {...props} />
      <instancedMesh key={`c${traffic.cars.length}`} ref={cabin} args={[geo.box, mats.car, traffic.cars.length]} {...props} />
      <instancedMesh key={`p${traffic.people.length}`} ref={people} args={[geo.person, mats.person, traffic.people.length]} {...props} />
    </>
  )
}

type CityProps = CityScene & { palette: Palette; shapes: Shapes }

export function City({ plan, traffic, running, dim, palette, shapes }: CityProps) {
  const invalidate = useThree((s) => s.invalidate)
  const [u] = useState(fadeUniforms)
  const hazeTop = Math.max(...plan.blocks.map((b) => b.h), 1)
  useEffect(() => {
    setFade(u, dim, hazeTop)
    invalidate()
  }, [u, dim, hazeTop, invalidate])
  return (
    <group>
      <Sketch plan={plan} palette={palette} shapes={shapes} u={u} />
      <Life traffic={traffic} palette={palette} u={u} running={running} />
    </group>
  )
}
