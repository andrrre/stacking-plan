import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { BackSide, LineBasicMaterial, MeshBasicMaterial } from 'three'
import type { Box } from '../layout3d'
import type { Palette } from '../palette'
import type { Footprint } from '../tourCamera'
import { roomParts } from '../tourRoom'
import { mix } from './cityShared'
import type { Shapes } from './resources'

// The suite on a tour, from inside: its floor in its status colour washed out towards the slab's neutral, its
// outline on the floor, a ceiling, and its two facades as open window walls (columns and a header beam), so the
// city shows through. Drawn in place of the suite's box while the camera goes in and stands inside. Shared unit
// shapes scaled per part, and materials made once per palette (a new stop only recolours the floor), so moving
// from stop to stop builds no geometry.

type Props = { foot: Footprint; fill: string; palette: Palette; shapes: Shapes }

function useRoomMaterials(p: Palette) {
  const mats = useMemo(() => ({
    floor: new MeshBasicMaterial({ color: p.roof }),
    // The ceiling's underside only: from above (the camera coming in) the room stays open to look into.
    ceiling: new MeshBasicMaterial({ color: mix(p.surface, p.roofEdge, 0.35), side: BackSide }),
    frame: new MeshBasicMaterial({ color: mix(p.roofEdge, p.muted, 0.45) }),
    outline: new LineBasicMaterial({ color: mix(p.roofEdge, p.text, 0.45) }),
  }), [p])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  return mats
}

/** How far the floor's status colour is washed out towards the slab's neutral (0: the fill itself). */
const FLOOR_WASH = 0.88

const at = (b: Box) => ({ position: [b.x, b.y, b.z] as const, scale: [b.w, b.h, b.d] as const })

export function TourRoom({ foot, fill, palette, shapes }: Props) {
  const invalidate = useThree((s) => s.invalidate)
  const mats = useRoomMaterials(palette)
  const parts = useMemo(() => roomParts(foot), [foot])
  // The suite's status colour, washed out towards the slab: it reads as its floor, not as its box.
  useEffect(() => {
    mats.floor.color.copy(mix(fill, palette.roof, FLOOR_WASH))
    invalidate()
  }, [mats, fill, palette, invalidate])
  const f = parts.floor
  const c = parts.ceiling
  return (
    <group dispose={null}>
      <mesh geometry={shapes.plane} material={mats.floor} rotation-x={-Math.PI / 2} position={[f.x, f.y, f.z]} scale={[f.w, f.d, 1]} />
      <lineSegments geometry={shapes.edges} material={mats.outline} {...at({ ...f, y: f.y + 0.002 })} />
      <mesh geometry={shapes.plane} material={mats.ceiling} rotation-x={-Math.PI / 2} position={[c.x, c.y, c.z]} scale={[c.w, c.d, 1]} />
      {[...parts.columns, ...parts.beams].map((b) => (
        <mesh key={`${b.x.toFixed(3)},${b.y.toFixed(3)},${b.z}`} geometry={shapes.box} material={mats.frame} {...at(b)} />
      ))}
    </group>
  )
}
