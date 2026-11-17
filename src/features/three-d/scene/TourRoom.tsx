import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { BackSide, LineBasicMaterial, MeshBasicMaterial } from 'three'
import type { Box } from '../layout3d'
import type { Palette } from '../palette'
import type { Footprint } from '../tourCamera'
import { roomParts } from '../tourRoom'
import { mix } from './cityShared'
import type { Shapes } from './resources'
import { TourInterior } from './TourInterior'

// The suite on a tour, from inside: a neutral floor (the slab's colour) with its outline and a thin band just
// inside its edge in the suite's status colour, a ceiling, and its two facades as open window walls (columns and
// a header beam), so the city shows through; inside them its walls, door and an illustrative fit-out with people
// (TourInterior). Drawn in place of the suite's box while the camera goes in, stands
// inside and leaves. Shared unit shapes scaled per part, and materials made once per palette (a new stop only
// recolours the band and outline), so moving from stop to stop builds no geometry.

/** `sf`, `seed`: the stop's size and suites (its illustrative fit-out); `moving`: its people walk (the look phase). */
type Props = { foot: Footprint; fill: string; palette: Palette; shapes: Shapes; sf: number; seed: string; moving: boolean }

function useRoomMaterials(p: Palette) {
  const mats = useMemo(() => ({
    floor: new MeshBasicMaterial({ color: p.roof }),
    // The ceiling's underside only: from above (the camera coming in) the room stays open to look into.
    ceiling: new MeshBasicMaterial({ color: mix(p.surface, p.roofEdge, 0.35), side: BackSide }),
    frame: new MeshBasicMaterial({ color: mix(p.roofEdge, p.muted, 0.45) }),
    band: new MeshBasicMaterial({ color: p.roofEdge }),
    outline: new LineBasicMaterial({ color: p.roofEdge }),
  }), [p])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  return mats
}

const at = (b: Box) => ({ position: [b.x, b.y, b.z] as const, scale: [b.w, b.h, b.d] as const })

export function TourRoom({ foot, fill, palette, shapes, sf, seed, moving }: Props) {
  const invalidate = useThree((s) => s.invalidate)
  const mats = useRoomMaterials(palette)
  const parts = useMemo(() => roomParts(foot), [foot])
  // The suite's status colour on its edge only: the floor stays neutral, so it never reads as a coloured carpet.
  useEffect(() => {
    mats.band.color.set(fill)
    mats.outline.color.set(fill)
    invalidate()
  }, [mats, fill, invalidate])
  const f = parts.floor
  const c = parts.ceiling
  return (
    <group dispose={null}>
      <mesh geometry={shapes.plane} material={mats.floor} rotation-x={-Math.PI / 2} position={[f.x, f.y, f.z]} scale={[f.w, f.d, 1]} />
      <lineSegments geometry={shapes.edges} material={mats.outline} {...at({ ...f, y: f.y + 0.002 })} />
      {parts.band.map((b) => (
        <mesh key={`${b.x.toFixed(3)},${b.z.toFixed(3)}`} geometry={shapes.plane} material={mats.band} rotation-x={-Math.PI / 2} position={[b.x, b.y, b.z]} scale={[b.w, b.d, 1]} />
      ))}
      <mesh geometry={shapes.plane} material={mats.ceiling} rotation-x={-Math.PI / 2} position={[c.x, c.y, c.z]} scale={[c.w, c.d, 1]} />
      {[...parts.columns, ...parts.beams].map((b) => (
        <mesh key={`${b.x.toFixed(3)},${b.y.toFixed(3)},${b.z}`} geometry={shapes.box} material={mats.frame} {...at(b)} />
      ))}
      <TourInterior foot={foot} sf={sf} seed={seed} palette={palette} moving={moving} />
    </group>
  )
}
