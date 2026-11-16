import { describe, expect, it } from 'vitest'
import { AZIMUTH_LIMIT, ELEVATION_RANGE, viewDirection, type Vec3 } from '../camera'
import { DEPTH, LIFT, PLINTH_H, SLAB_T, TOP_LABEL_DEPTH } from '../layout3d'
import { MAX_BLOCKS, MIN_BLOCKS, PAVE, cityPlan, hashSeed, roadRects, seededRandom, type Block, type Site } from './plan'

const ODT: Site = { halfW: 9.66, halfD: 4.76, height: 12.4 }
const CAMPUS: Site = { halfW: 9.66, halfD: 4.76, height: 8.4 }
const TALL: Site = { halfW: 9.66, halfD: 4.76, height: 25.4 }
const IDS = ['odt', 'pbp', 'bsp', 'mgc', 'fex', 'tall', 'imported-1', 'x', '']

const overlaps = (a: { x0: number; x1: number; z0: number; z1: number }, b: { x0: number; x1: number; z0: number; z1: number }) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1
const footprint = (b: Block) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 })

describe('seededRandom', () => {
  it('gives the same sequence for the same seed and a different one for another seed', () => {
    const a = seededRandom(hashSeed('odt'))
    const b = seededRandom(hashSeed('odt'))
    const c = seededRandom(hashSeed('pbp'))
    const xs = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(xs)
    expect([c(), c(), c()]).not.toEqual(xs)
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true)
  })
})

describe('cityPlan', () => {
  it('is deterministic per building id, and differs between the demo buildings', () => {
    expect(cityPlan('odt', ODT)).toEqual(cityPlan('odt', ODT))
    const keys = ['odt', 'pbp', 'bsp', 'mgc', 'fex'].map((id) => JSON.stringify(cityPlan(id, ODT).blocks))
    expect(new Set(keys).size).toBe(5)
  })

  it(`places ${MIN_BLOCKS}–${MAX_BLOCKS} neighbour blocks for any id and site`, () => {
    for (const id of IDS) for (const site of [ODT, CAMPUS, TALL]) {
      const n = cityPlan(id, site).blocks.length
      expect(n, id).toBeGreaterThanOrEqual(MIN_BLOCKS)
      expect(n, id).toBeLessThanOrEqual(MAX_BLOCKS)
    }
  })

  it('caps every neighbour at 1.1× our height (the 8-floor campus building is not dwarfed)', () => {
    for (const id of IDS) for (const site of [ODT, CAMPUS, TALL]) {
      for (const b of cityPlan(id, site).blocks) {
        expect(b.h).toBeLessThanOrEqual(site.height * 1.1 + 1e-9)
        expect(b.h).toBeGreaterThan(0)
      }
    }
  })

  it('keeps every block off our lot, off the roads and out of the front: behind or to the sides only', () => {
    for (const id of IDS) {
      const plan = cityPlan(id, ODT)
      const roads = roadRects(plan.roads)
      for (const b of plan.blocks) {
        const f = footprint(b)
        expect(overlaps(f, plan.lot), id).toBe(false)
        for (const r of roads) expect(overlaps(f, r), `${id} road`).toBe(false)
        expect(f.z1, `${id} front`).toBeLessThanOrEqual(-0.5)
        expect(f.z0 < plan.lot.z0 || Math.min(Math.abs(f.x0), Math.abs(f.x1)) > plan.lot.x1, id).toBe(true)
      }
    }
  })

  it('blocks do not overlap one another', () => {
    for (const id of IDS) {
      const bs = cityPlan(id, ODT).blocks.map(footprint)
      bs.forEach((a, i) => bs.slice(i + 1).forEach((b) => expect(overlaps(a, b), id).toBe(false)))
    }
  })

  it('has a road in front and one at each side of our lot, with a pavement between', () => {
    const plan = cityPlan('odt', ODT)
    const byId = new Map(plan.roads.map((r) => [r.id, r]))
    const front = byId.get('front')
    const left = byId.get('left')
    const right = byId.get('right')
    expect(front?.axis).toBe('x')
    expect(left?.axis).toBe('z')
    expect(right?.axis).toBe('z')
    expect((front?.at ?? 0) - (front?.width ?? 0) / 2).toBeCloseTo(ODT.halfD + PAVE)
    expect((right?.at ?? 0) - (right?.width ?? 0) / 2).toBeCloseTo(ODT.halfW + PAVE)
    expect((left?.at ?? 0) + (left?.width ?? 0) / 2).toBeCloseTo(-ODT.halfW - PAVE)
  })

  it('trees stand off the roads, our lot and the front', () => {
    for (const id of IDS) {
      const plan = cityPlan(id, ODT)
      expect(plan.trees.length).toBeGreaterThan(0)
      for (const t of plan.trees) {
        const f = { x0: t.x - t.r, x1: t.x + t.r, z0: t.z - t.r, z1: t.z + t.r }
        expect(overlaps(f, plan.lot), id).toBe(false)
        for (const r of roadRects(plan.roads)) expect(overlaps(f, r), id).toBe(false)
        expect(f.z1).toBeLessThanOrEqual(-0.5)
      }
    }
  })
})

describe('roadRects', () => {
  it('cuts the side roads where they cross the front and back roads, so no two rects overlap', () => {
    const rects = roadRects(cityPlan('odt', ODT).roads)
    rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)))
  })
})

// --- occlusion: no block ever stands between any allowed camera and a label face -----------------------------

type Box3 = { min: Vec3; max: Vec3 }

/** Whether the segment p→q passes through the box (slab test). */
function segmentHits(p: Vec3, q: Vec3, b: Box3): boolean {
  let t0 = 0
  let t1 = 1
  for (let i = 0; i < 3; i++) {
    const d = (q[i] ?? 0) - (p[i] ?? 0)
    const lo = b.min[i] ?? 0
    const hi = b.max[i] ?? 0
    if (Math.abs(d) < 1e-12) {
      if ((p[i] ?? 0) < lo || (p[i] ?? 0) > hi) return false
      continue
    }
    const a = (lo - (p[i] ?? 0)) / d
    const c = (hi - (p[i] ?? 0)) / d
    t0 = Math.max(t0, Math.min(a, c))
    t1 = Math.min(t1, Math.max(a, c))
    if (t0 > t1) return false
  }
  return true
}

/** Label points: the front faces (lifted or not) and the top-face strips and floor-view plates, floors apart. */
function labelPoints(site: Site): Vec3[] {
  const out: Vec3[] = []
  const front = DEPTH / 2
  for (let y = PLINTH_H + SLAB_T; y <= site.height * 3.2; y += 2.5) {
    for (const x of [-9, 0, 9]) {
      out.push([x, y, front], [x, y, front + LIFT], [x, y, front - TOP_LABEL_DEPTH], [x, y, -front + 0.2])
    }
  }
  return out
}

/** Every camera the orbit limits allow, sampled: angles, distances and targets low, middle and high. */
function eyes(site: Site): Vec3[] {
  const targets: Vec3[] = [[0, 0.5, 0], [0, site.height / 2, 0], [0, site.height * 1.6, 0]]
  const views = [-AZIMUTH_LIMIT, -25, 0, 25, AZIMUTH_LIMIT].flatMap((azimuth) =>
    [ELEVATION_RANGE.min, 14.5, 32, 45, ELEVATION_RANGE.max].map((elevation) => viewDirection({ azimuth, elevation })))
  return views.flatMap((dir) => [25, 60, 150].flatMap((dist) =>
    targets.map((t): Vec3 => [t[0] + dir[0] * dist, t[1] + dir[1] * dist, t[2] + dir[2] * dist])))
}

describe('occlusion', () => {
  it('no block covers any label point from any camera the orbit limits allow', () => {
    for (const site of [CAMPUS, ODT, TALL]) for (const id of ['odt', 'pbp', 'bsp', 'mgc', 'fex']) {
      const boxes: Box3[] = cityPlan(id, site).blocks.map((b) => ({ min: [b.x - b.w / 2, 0, b.z - b.d / 2], max: [b.x + b.w / 2, b.h, b.z + b.d / 2] }))
      const pts = labelPoints(site)
      const hits = eyes(site).flatMap((eye) => pts.filter((p) => boxes.some((b) => segmentHits(eye, p, b))).map((p) => `${id}: ${eye.join()} → ${p.join()}`))
      expect(hits.slice(0, 5)).toEqual([])
    }
  })
})
