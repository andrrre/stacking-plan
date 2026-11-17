import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { BoxGeometry, CylinderGeometry, LineBasicMaterial, MeshBasicMaterial, SphereGeometry, type InstancedMesh } from 'three'
import { nextTick, type Tick } from '../city/motion'
import { poseAt } from '../city/traffic'
import { fitOut, type Interior } from '../fitout/fitOut'
import type { Piece } from '../fitout/rect'
import { FLOOR_TOP } from '../fitout/shell'
import type { Palette } from '../palette'
import type { Footprint } from '../tourCamera'
import { fadeUniforms, shadeByNormal } from './cityMaterials'
import { NO_HIT, useMeshDisposal } from './cityShared'
import { byKind, edgeColour, fillInstances, outlineGeometry, toneColours } from './interiorParts'
import { People } from './People'

// The suite's illustrative fit-out on a tour (fitout/fitOut.ts lays it out): walls, door, glazing, furniture and
// plants as a few instanced meshes (opaque boxes, cylinders, spheres, and glass) plus one merged set of outlines,
// and the people walking about (the city's figures, drawn by People). Built once per stop, recoloured per palette,
// all of it disposed when the room goes. The people walk only while `moving` (the look phase, motion welcome):
// then a frame is asked for about 30 times a second; otherwise the canvas renders on demand as ever. Counts and a walker's
// place are written on the canvas for tests (data-room-*).

type Props = { foot: Footprint; sf: number; seed: string; palette: Palette; moving: boolean }

const SHADES = { top: 1, front: 0.93, side: 0.84, back: 0.89 }
const NO_RAYCAST = { raycast: NO_HIT, dispose: null, frustumCulled: false } as const

function useShapes() {
  const geo = useMemo(() => ({
    box: shadeByNormal(new BoxGeometry(1, 1, 1), SHADES),
    cylinder: shadeByNormal(new CylinderGeometry(0.5, 0.5, 1, 14), SHADES),
    sphere: shadeByNormal(new SphereGeometry(0.5, 12, 8), SHADES),
    glass: new BoxGeometry(1, 1, 1),
  }), [])
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])
  return geo
}

function useMaterials(p: Palette) {
  const mats = useMemo(() => ({
    solid: new MeshBasicMaterial({ vertexColors: true }),
    glass: new MeshBasicMaterial({ transparent: true, opacity: 0.24, depthWrite: false }), // tinted by its instances' colour
    edges: new LineBasicMaterial({ color: edgeColour(p), transparent: true, opacity: 0.6 }),
  }), [p])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  return mats
}

/** One instanced mesh for `pieces`, filled (matrices and colours) whenever they or the palette change. */
function Instances({ pieces, geometry, material, palette, order = 0 }: {
  pieces: readonly Piece[]; geometry: BoxGeometry | CylinderGeometry | SphereGeometry; material: MeshBasicMaterial; palette: Palette; order?: number
}) {
  const ref = useRef<InstancedMesh>(null)
  const n = pieces.length
  useMeshDisposal(ref, geometry, material, n)
  useLayoutEffect(() => {
    if (ref.current) fillInstances(ref.current, pieces, toneColours(palette))
  }, [pieces, palette, geometry, material])
  if (n === 0) return null
  return <instancedMesh key={n} ref={ref} args={[geometry, material, n]} renderOrder={order} {...NO_RAYCAST} />
}

/** The merged outlines, rebuilt with the pieces. */
function Outlines({ pieces, material }: { pieces: readonly Piece[]; material: LineBasicMaterial }) {
  const geometry = useMemo(() => outlineGeometry(pieces), [pieces])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <lineSegments geometry={geometry} material={material} {...NO_RAYCAST} />
}

const ROOM_ATTRS = ['data-room-walls', 'data-room-doors', 'data-room-furniture', 'data-room-people', 'data-room-pieces', 'data-room-wall-colour']

/** Writes the room's counts and its wall colour on the canvas while it is drawn (tests read them; no pixels). */
function useRoomReport(el: HTMLElement, room: Interior, palette: Palette): void {
  useEffect(() => {
    el.setAttribute('data-room-walls', String(room.walls))
    el.setAttribute('data-room-doors', String(room.doors))
    el.setAttribute('data-room-furniture', String(room.items.length))
    el.setAttribute('data-room-people', String(room.people.length))
    el.setAttribute('data-room-pieces', String(room.pieces.length))
    el.setAttribute('data-room-wall-colour', `#${toneColours(palette).wall.getHexString()}`)
    return () => ROOM_ATTRS.forEach((a) => el.removeAttribute(a))
  }, [el, room, palette])
}

/**
 * The people's clock, as the city's (useCityClock): while `moving`, ticks about 30 times a second (requestAnimationFrame,
 * throttled) and asks for a frame each tick; otherwise it holds its time and asks for nothing. Each room starts at 0.
 * The effect's cleanup cancels the loop, so a StrictMode remount cannot leave two running.
 */
function usePeopleClock(room: Interior, moving: boolean, el: HTMLElement): RefObject<Tick> {
  const clock = useRef<Tick>({ at: 0, elapsed: 0 })
  const invalidate = useThree((s) => s.invalidate)
  const report = useCallback((t: number) => {
    const first = room.people.find((m) => m.speed > 0) ?? room.people[0]
    const at = first ? poseAt(first, t) : null
    el.setAttribute('data-room-walk', at ? `${at.x.toFixed(3)},${at.z.toFixed(3)}` : '')
  }, [room, el])
  useLayoutEffect(() => {
    clock.current = { at: 0, elapsed: 0 }
    report(0)
    invalidate()
    return () => el.removeAttribute('data-room-walk')
  }, [report, invalidate, el])
  useEffect(() => {
    if (!moving) return
    clock.current = { ...clock.current, at: performance.now() } // carries on from where it stood, not from when it stopped
    let frame = 0
    const step = (now: number) => {
      const next = nextTick(clock.current, now)
      if (next) {
        clock.current = next
        report(next.elapsed)
        invalidate()
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [moving, report, invalidate])
  return clock
}

export function TourInterior({ foot, sf, seed, palette, moving }: Props) {
  const el = useThree((s) => s.gl.domElement)
  const room = useMemo(() => fitOut({ foot, sf, seed }), [foot, sf, seed])
  const parts = useMemo(() => byKind(room.pieces), [room])
  const geo = useShapes()
  const mats = useMaterials(palette)
  const [u] = useState(fadeUniforms) // the city's fade, unused this close: the room is never far from the building's centre
  useRoomReport(el, room, palette)
  const clock = usePeopleClock(room, moving, el)
  return (
    <group dispose={null}>
      <Instances pieces={parts.box} geometry={geo.box} material={mats.solid} palette={palette} />
      <Instances pieces={parts.cylinder} geometry={geo.cylinder} material={mats.solid} palette={palette} />
      <Instances pieces={parts.sphere} geometry={geo.sphere} material={mats.solid} palette={palette} />
      <Outlines pieces={room.pieces} material={mats.edges} />
      <Instances pieces={parts.glass} geometry={geo.glass} material={mats.glass} palette={palette} order={3} />
      <group position-y={foot.floor + FLOOR_TOP}>
        <People people={room.people} palette={palette} u={u} clock={clock} />
      </group>
    </group>
  )
}
