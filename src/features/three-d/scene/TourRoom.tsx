import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { BackSide, MeshBasicMaterial, type Group, type Mesh } from 'three'
import type { Box } from '../layout3d'
import type { Palette } from '../palette'
import type { Footprint } from '../tourCamera'
import { roomParts } from '../tourRoom'
import { mix } from './cityShared'
import { statusColoured } from './interiorParts'
import type { Shapes } from './resources'
import { TourInterior } from './TourInterior'

// The suite on a tour, from inside: a neutral floor (the slab's colour), a ceiling, and its two facades as open
// window walls (columns and a header beam), so the city shows through; inside them its walls, door and an
// illustrative fit-out with people (TourInterior). Drawn in place of the suite's box (hidden while the camera goes
// in, stands inside and leaves). No status colour anywhere in it: the caption says what the space is. The canvas
// reports how many of the room's drawn colours are status colours (`data-room-status`, 0) and whether the stop's
// own boxes are hidden (`data-room-suite-hidden`), for tests.

/** `sf`, `suiteIds`: the stop's size and suites (its illustrative fit-out); `moving`: its people walk (the look phase). */
type Props = { foot: Footprint; palette: Palette; shapes: Shapes; sf: number; suiteIds: readonly string[]; moving: boolean }

function useRoomMaterials(p: Palette) {
  const mats = useMemo(() => ({
    floor: new MeshBasicMaterial({ color: p.roof }),
    // The ceiling's underside only: from above (the camera coming in) the room stays open to look into.
    ceiling: new MeshBasicMaterial({ color: mix(p.surface, p.roofEdge, 0.35), side: BackSide }),
    frame: new MeshBasicMaterial({ color: mix(p.roofEdge, p.muted, 0.45) }),
  }), [p])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  return mats
}

const at = (b: Box) => ({ position: [b.x, b.y, b.z] as const, scale: [b.w, b.h, b.d] as const })

/** Writes the room's status-colour count and whether the stop's own suite boxes are hidden on the canvas (tests). */
function useStatusReport(room: RefObject<Group | null>, palette: Palette, suiteIds: readonly string[], key: unknown): void {
  const el = useThree((s) => s.gl.domElement)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    void key
    if (room.current) el.setAttribute('data-room-status', String(statusColoured(room.current, palette)))
    const own: boolean[] = []
    scene.traverse((o) => {
      if ((o as Mesh).isMesh && suiteIds.includes(String(o.userData.suiteId))) own.push(o.visible)
    })
    el.setAttribute('data-room-suite-hidden', String(own.length > 0 && own.every((v) => !v)))
    return () => {
      el.removeAttribute('data-room-status')
      el.removeAttribute('data-room-suite-hidden')
    }
  }, [el, scene, room, palette, suiteIds, key])
}

export function TourRoom({ foot, palette, shapes, sf, suiteIds, moving }: Props) {
  const mats = useRoomMaterials(palette)
  const parts = useMemo(() => roomParts(foot), [foot])
  const group = useRef<Group>(null)
  const seed = suiteIds.join('+')
  useStatusReport(group, palette, suiteIds, `${seed}|${foot.x0}|${foot.x1}`)
  const f = parts.floor
  const c = parts.ceiling
  return (
    <group ref={group} dispose={null}>
      <mesh geometry={shapes.plane} material={mats.floor} rotation-x={-Math.PI / 2} position={[f.x, f.y, f.z]} scale={[f.w, f.d, 1]} />
      <mesh geometry={shapes.plane} material={mats.ceiling} rotation-x={-Math.PI / 2} position={[c.x, c.y, c.z]} scale={[c.w, c.d, 1]} />
      {[...parts.columns, ...parts.beams].map((b) => (
        <mesh key={`${b.x.toFixed(3)},${b.y.toFixed(3)},${b.z}`} geometry={shapes.box} material={mats.frame} {...at(b)} />
      ))}
      <TourInterior foot={foot} sf={sf} seed={seed} palette={palette} moving={moving} />
    </group>
  )
}
