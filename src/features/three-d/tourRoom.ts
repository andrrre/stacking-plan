import { SUITE_H, type Box } from './layout3d'
import type { Footprint } from './tourCamera'

// The suite seen from inside on a tour: honest massing, no furniture. Its floor and ceiling over its footprint,
// and its two facades (every suite runs the plate's depth, front to back) as open window walls: a column at each
// end and at most a structural bay apart, and a header beam along the top. Pure: a footprint in, boxes out.

/** The most a facade runs between columns (world units; one floor ≈ 4 m, so 6 m). */
export const COLUMN_BAY = 1.5
const COLUMN = 0.08 // a column's width and depth
const BEAM_H = 0.09
const FLOOR_LIFT = 0.006 // the floor just above the slab's top, so the two never fight for depth
const THIN = 0.004

export type RoomParts = { floor: Box; ceiling: Box; columns: Box[]; beams: Box[] }

/** Column centres along a facade from x0 to x1: one at each end, evenly spaced at most COLUMN_BAY apart. */
function columnXs(x0: number, x1: number): number[] {
  const a = x0 + COLUMN / 2
  const b = x1 - COLUMN / 2
  const bays = Math.max(Math.ceil((b - a) / COLUMN_BAY), 1)
  return Array.from({ length: bays + 1 }, (_, i) => a + ((b - a) * i) / bays)
}

export function roomParts(f: Footprint): RoomParts {
  const w = f.x1 - f.x0
  const d = f.z1 - f.z0
  const x = (f.x0 + f.x1) / 2
  const z = (f.z0 + f.z1) / 2
  const top = f.floor + SUITE_H
  const facades = [f.z0, f.z1]
  return {
    floor: { x, y: f.floor + FLOOR_LIFT, z, w, h: THIN, d },
    ceiling: { x, y: top, z, w, h: THIN, d },
    columns: facades.flatMap((fz) => columnXs(f.x0, f.x1).map((cx) => ({ x: cx, y: f.floor + SUITE_H / 2, z: fz, w: COLUMN, h: SUITE_H, d: COLUMN }))),
    beams: facades.map((fz) => ({ x, y: top - BEAM_H / 2, z: fz, w, h: BEAM_H, d: COLUMN })),
  }
}
