// The sketched city around the building, in world units (axes as in layout3d.ts: x along the facade, y up,
// z towards the viewer; our building's footprint is centred on the origin). Pure: a building id and the
// building's footprint and height in, roads, neighbour blocks and trees out. The id seeds every choice, so
// each building always gets the same neighbourhood. Nothing stands in front of the building (z > -0.5 is kept
// clear except for our own lot and the roads), so no allowed camera can see a neighbour over the facade.

/** Our building's footprint (half extents of the plinth) and its height with the floors together. */
export type Site = { halfW: number; halfD: number; height: number }
export type Rect = { x0: number; x1: number; z0: number; z1: number }

/** A straight road: along x or z, centred on `at` across its run, from `from` to `to` along it. */
export type Road = { id: string; axis: 'x' | 'z'; at: number; width: number; from: number; to: number; traffic: boolean }
/** A neighbour building: footprint centre (x, z), size w (x) × d (z), height h; `far` for the back row. */
export type Block = { x: number; z: number; w: number; d: number; h: number; far: boolean }
export type Tree = { x: number; z: number; h: number; r: number }

export type CityPlan = { lot: Rect; roads: Road[]; blocks: Block[]; trees: Tree[] }

export const PAVE = 0.9 // pavement width (about 3.5 m at one floor ≈ 4 m)
export const ROAD = 2.6 // two lanes
export const REACH = 70 // how far the roads run from the building
export const MIN_BLOCKS = 10
export const MAX_BLOCKS = 16
const FRONT_LIMIT = -0.5 // no block or tree reaches past this z: the facade side stays open
const HEIGHT_CAP = 1.1 // neighbours stay at most this many times our height

/** FNV-1a: a 32-bit seed from a string. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** mulberry32: a small deterministic generator of numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rand = () => number
const between = (rand: Rand, lo: number, hi: number) => lo + (hi - lo) * rand()

/** Our block, the four roads around it and a rear road behind the first row of neighbours. */
function roadsAround(lot: Rect, rowDepth: number): Road[] {
  const road = (id: string, axis: 'x' | 'z', at: number, traffic: boolean, to = REACH): Road =>
    ({ id, axis, at, width: ROAD, from: -REACH, to, traffic })
  const back = lot.z0 - ROAD / 2
  return [
    road('front', 'x', lot.z1 + ROAD / 2, true),
    road('left', 'z', lot.x0 - ROAD / 2, true, REACH / 2),
    road('right', 'z', lot.x1 + ROAD / 2, true, REACH / 2),
    road('back', 'x', back, false),
    road('rear', 'x', back - ROAD / 2 - 2 * PAVE - rowDepth - ROAD / 2, false),
  ]
}

type RowSpec = { x0: number; x1: number; z1: number; w: [number, number]; d: [number, number]; h: [number, number]; far: boolean }

/** One run of blocks between x0 and x1, fronts aligned on z1 (each a little set back at random). */
function run(rand: Rand, span: RowSpec): Block[] {
  const out: Block[] = []
  let x = span.x0 + between(rand, 0, 1.2)
  for (;;) {
    const w = between(rand, ...span.w)
    if (x + w > span.x1) return out
    const d = between(rand, ...span.d)
    const back = between(rand, 0, 0.6)
    out.push({ x: x + w / 2, z: span.z1 - back - d / 2, w, d, h: between(rand, ...span.h), far: span.far })
    x += w + between(rand, 1, 2.2)
  }
}

/** A row of blocks across x, broken where the side roads (and their pavements) run through it. */
function row(rand: Rand, roads: readonly Road[], spec: RowSpec): Block[] {
  const across: Road = { id: 'row', axis: 'x', at: spec.z1, width: 0, from: spec.x0, to: spec.x1, traffic: false }
  return cut(spec.x0, spec.x1, crossings(across, roads, PAVE)).flatMap(([x0, x1]) => run(rand, { ...spec, x0, x1 }))
}

const ROW_DEPTH = 7.5

function neighbours(rand: Rand, site: Site, lot: Rect, roads: readonly Road[]): Block[] {
  const at = (id: string) => roads.find((r) => r.id === id)?.at ?? 0
  const H = site.height
  const sideX = lot.x1 + ROAD + PAVE
  const sideZ = { z0: lot.z0, z1: FRONT_LIMIT }
  const side = (sign: 1 | -1): Block => {
    const w = between(rand, 5, 8)
    const d = sideZ.z1 - sideZ.z0 - between(rand, 0, 1)
    return { x: sign * (sideX + w / 2 + between(rand, 0, 0.8)), z: sideZ.z1 - d / 2, w, d, h: between(rand, 0.25, 0.55) * H, far: false }
  }
  const near = row(rand, roads, { x0: -site.halfW - 18, x1: site.halfW + 18, z1: at('back') - ROAD / 2 - PAVE, w: [5, 10], d: [4.5, ROW_DEPTH], h: [0.3 * H, 0.8 * H], far: false })
  const far = row(rand, roads, { x0: -site.halfW - 32, x1: site.halfW + 32, z1: at('rear') - ROAD / 2 - PAVE, w: [7, 13], d: [6, 10], h: [0.5 * H, 1.1 * H], far: true })
  // Never more than MAX_BLOCKS: the outermost far blocks go first.
  const all = [side(-1), side(1), ...near, ...far.sort((a, b) => Math.abs(a.x) - Math.abs(b.x))]
  return all.slice(0, MAX_BLOCKS).map((b) => ({ ...b, h: Math.min(Math.max(b.h, 1.2), HEIGHT_CAP * H) }))
}

/**
 * A few trees on the far pavement of the back road, beyond the side roads: beside the building, never on the
 * facade side, and clear of the floor numbers down its left edge.
 */
function treesAround(rand: Rand, lot: Rect, roads: readonly Road[]): Tree[] {
  const back = roads.find((r) => r.id === 'back')?.at ?? 0
  const z = back - ROAD / 2 - PAVE / 2
  const sideX = lot.x1 + ROAD + PAVE
  const tree = (x: number): Tree => {
    const h = between(rand, 1.4, 2)
    return { x, z, h, r: Math.min(h * 0.3, PAVE / 2 - 0.05) }
  }
  return [4, 9].flatMap((step) => [tree(-sideX - step - between(rand, 0, 2)), tree(sideX + step + between(rand, 0, 2))])
}

export function cityPlan(buildingId: string, site: Site): CityPlan {
  const rand = seededRandom(hashSeed(buildingId))
  const lot: Rect = { x0: -site.halfW - PAVE, x1: site.halfW + PAVE, z0: -site.halfD - PAVE, z1: site.halfD + PAVE }
  const roads = roadsAround(lot, ROW_DEPTH)
  return { lot, roads, blocks: neighbours(rand, site, lot, roads), trees: treesAround(rand, lot, roads) }
}

const rectOf = (r: Road, from: number, to: number): Rect => (r.axis === 'x'
  ? { x0: from, x1: to, z0: r.at - r.width / 2, z1: r.at + r.width / 2 }
  : { x0: r.at - r.width / 2, x1: r.at + r.width / 2, z0: from, z1: to })

/** [from, to] with the given intervals cut out (sorted, merged as needed). */
export function cut(from: number, to: number, holes: readonly [number, number][]): [number, number][] {
  const sorted = [...holes].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  let start = from
  for (const [a, b] of sorted) {
    if (b <= start || a >= to) continue
    if (a > start) out.push([start, a])
    start = Math.max(start, b)
  }
  if (start < to) out.push([start, to])
  return out
}

/** Where the roads of the other axis cross road `r`, as intervals along it (`grow` widens each crossing). */
export function crossings(r: Road, roads: readonly Road[], grow = 0): [number, number][] {
  return roads
    .filter((o) => o.axis !== r.axis && r.at >= o.from && r.at <= o.to)
    .map((o) => [o.at - o.width / 2 - grow, o.at + o.width / 2 + grow])
}

/** The road surfaces as rectangles that do not overlap: the z roads are cut where the x roads cross them. */
export function roadRects(roads: readonly Road[]): Rect[] {
  return roads.flatMap((r) => (r.axis === 'x'
    ? [rectOf(r, r.from, r.to)]
    : cut(r.from, r.to, crossings(r, roads)).map(([a, b]) => rectOf(r, a, b))))
}
