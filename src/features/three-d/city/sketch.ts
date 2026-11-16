import { PAVE, crossings, cut, type Block, type Road, type Tree } from './plan'

// The city's line work as flat arrays of segment end points ([x, y, z, x, y, z, …], ready for a
// LineSegments geometry). Pure. Blocks get their outline and a floor line every FLOOR_LINE_EVERY units;
// trees a trunk and a six-sided cone; roads their kerbs, the pavements' outer edges and a dashed centre
// line, all broken where another road crosses.

export const FLOOR_LINE_EVERY = 2
export const GROUND_Y = 0.01 // ground lines sit just above the road surfaces
const DASH = 0.9
const DASH_GAP = 1.3

type Seg = [number, number, number, number, number, number]

const rectAt = (x0: number, x1: number, z0: number, z1: number, y: number): Seg[] => [
  [x0, y, z0, x1, y, z0], [x1, y, z0, x1, y, z1], [x1, y, z1, x0, y, z1], [x0, y, z1, x0, y, z0],
]

/** The 12 edges of a block and its floor lines. */
export function blockSegments(b: Block): Seg[] {
  const [x0, x1, z0, z1] = [b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2]
  const posts: Seg[] = [[x0, 0, z0, x0, b.h, z0], [x1, 0, z0, x1, b.h, z0], [x1, 0, z1, x1, b.h, z1], [x0, 0, z1, x0, b.h, z1]]
  const floors = Array.from({ length: Math.max(Math.ceil(b.h / FLOOR_LINE_EVERY) - 1, 0) }, (_, i) => (i + 1) * FLOOR_LINE_EVERY)
    .filter((y) => b.h - y > 0.4)
  return [...rectAt(x0, x1, z0, z1, 0), ...rectAt(x0, x1, z0, z1, b.h), ...posts, ...floors.flatMap((y) => rectAt(x0, x1, z0, z1, y))]
}

const SIDES = 6

/** A trunk and a cone (apex to a six-sided base ring) for a tree. */
export function treeSegments(t: Tree): Seg[] {
  const base = t.h * 0.3
  const ring = Array.from({ length: SIDES }, (_, i) => {
    const a = (i / SIDES) * Math.PI * 2 + 0.3
    return [t.x + Math.cos(a) * t.r, base, t.z + Math.sin(a) * t.r] as const
  })
  const spokes = ring.map((p): Seg => [t.x, t.h, t.z, ...p])
  const rim = ring.map((p, i): Seg => [...p, ...(ring[(i + 1) % SIDES] ?? p)])
  return [[t.x, 0, t.z, t.x, base, t.z], ...spokes, ...rim]
}

/** A line `off` from the road's centre along its run, broken at the crossings (widened by `grow`). */
function edge(r: Road, roads: readonly Road[], off: number, grow: number): Seg[] {
  const y = GROUND_Y
  return cut(r.from, r.to, crossings(r, roads, grow)).map(([a, b]): Seg =>
    (r.axis === 'x' ? [a, y, r.at + off, b, y, r.at + off] : [r.at + off, y, a, r.at + off, y, b]))
}

/** The dashes of a road's centre line, none inside a crossing. */
function dashes(r: Road, roads: readonly Road[]): Seg[] {
  const y = GROUND_Y
  return cut(r.from, r.to, crossings(r, roads, 0.4)).flatMap(([a, b]) => {
    const n = Math.floor((b - a + DASH_GAP) / (DASH + DASH_GAP))
    return Array.from({ length: n }, (_, i): Seg => {
      const s = a + i * (DASH + DASH_GAP)
      return r.axis === 'x' ? [s, y, r.at, s + DASH, y, r.at] : [r.at, y, s, r.at, y, s + DASH]
    })
  })
}

/** Kerbs, pavement edges and centre dashes for every road. */
export function roadSegments(roads: readonly Road[]): Seg[] {
  return roads.flatMap((r) => {
    const k = r.width / 2
    return [
      ...edge(r, roads, k, 0), ...edge(r, roads, -k, 0),
      ...edge(r, roads, k + PAVE, PAVE), ...edge(r, roads, -k - PAVE, PAVE),
      ...dashes(r, roads),
    ]
  })
}

export const flatten = (segs: readonly Seg[]): Float32Array => Float32Array.from(segs.flat())
