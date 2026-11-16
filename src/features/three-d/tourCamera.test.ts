import { describe, it, expect } from 'vitest'
import { buildStackModel } from '../stack/suiteVisual'
import { BUNDLED_BUILDINGS } from '../../data'
import { cityPlan } from './city/plan'
import { DEPTH, PITCH, SLAB_T, buildingLayout, type SuiteBox } from './layout3d'
import {
  EYE_HEIGHT, LOOK_LIMITS, PAN_DEG, PAN_MS, clampLook, exteriorBounds, exteriorView, footprint, interiorLook, lookTarget, panYaw,
} from './tourCamera'

const TODAY = '2026-11-15'
const box = (over: Partial<SuiteBox>): SuiteBox =>
  ({ id: 'x', floor: 7, row: 0, col: 0, lifted: false, cover: null, x: 0, y: 7.5, z: 0, w: 2, h: 0.87, d: DEPTH, ...over })

const inside = (eye: readonly number[], f: NonNullable<ReturnType<typeof footprint>>) =>
  eye[0]! > f.x0 && eye[0]! < f.x1 && eye[2]! > f.z0 && eye[2]! < f.z1

describe('footprint', () => {
  it('is the union of the stop\'s suites, at their floor, over the full depth even when lifted out of the facade', () => {
    const f = footprint([box({ x: 1, w: 2, z: 0.32, lifted: true }), box({ x: 3.1, w: 2.2 })])
    expect(f).toEqual({ x0: 0, x1: 4.2, z0: -DEPTH / 2, z1: DEPTH / 2, floor: 7.5 - 0.87 / 2 })
  })

  it('no boxes: null', () => {
    expect(footprint([])).toBeNull()
  })
})

describe('interiorLook', () => {
  const cases: [string, SuiteBox[]][] = [
    ['a narrow suite', [box({ x: -2, w: 0.45 })]],
    ['a deep, wide suite', [box({ x: 0, w: 14 })]],
    ['a corner suite (the plate\'s left end)', [box({ x: -8.6, w: 0.8 })]],
    ['a corner suite (the plate\'s right end)', [box({ x: 8.6, w: 0.8 })]],
    ['a two-suite option', [box({ x: 1, w: 2 }), box({ x: 3.1, w: 2.2 })]],
  ]

  it.each(cases)('%s: the eye stands inside the footprint, in the room a few steps from the window it looks out of, at eye height', (_name, boxes) => {
    const f = footprint(boxes)!
    const { eye } = interiorLook(f)
    expect(inside(eye, f)).toBe(true)
    expect(eye[2] - f.z0).toBeGreaterThan(0.25 * (f.z1 - f.z0)) // not at the glass
    expect(eye[2]).toBeLessThan((f.z0 + f.z1) / 2) // nearer the window than the far wall
    expect(eye[1]).toBeCloseTo(f.floor + EYE_HEIGHT, 6)
  })

  it('eye height is 1.6 m at the model\'s ~4 m floor-to-floor (PITCH)', () => {
    expect(EYE_HEIGHT / PITCH).toBeCloseTo(0.4, 6)
    expect(EYE_HEIGHT).toBeGreaterThan(SLAB_T) // above the slab, below the suite's ceiling
    expect(EYE_HEIGHT).toBeLessThan(0.87)
  })

  it('looks out of the rear window wall (−z), level with a touch down, towards the sketched city', () => {
    const f = footprint([box({})])!
    const look = interiorLook(f)
    const t = lookTarget(look.eye, look.yaw, look.pitch)
    expect(t[2]).toBeLessThan(look.eye[2])
    expect(Math.abs(t[0] - look.eye[0])).toBeLessThan(1e-9)
    expect(t[1]).toBeLessThan(look.eye[1])
    expect(look.eye[1] - t[1]).toBeLessThan(0.1) // nearly level on a low floor
    const high = interiorLook(footprint([box({ y: 28.5 })])!)
    expect(high.pitch).toBeLessThan(look.pitch) // further down high up, where the neighbours' roofs are below
    expect(high.pitch).toBeGreaterThanOrEqual(-12)
    // The city stands on that side: every neighbour block lies beyond the rear window wall.
    const plan = cityPlan('odt', { halfW: 10, halfD: 5.2, height: 12.6 })
    for (const b of plan.blocks) expect(b.z).toBeLessThan(look.eye[2])
    expect(plan.blocks.filter((b) => b.z + b.d / 2 < f.z0).length).toBeGreaterThan(plan.blocks.length / 2)
  })

  it('on the real hero building, every available suite\'s eye is inside it', () => {
    const model = buildStackModel({
      building: BUNDLED_BUILDINGS[0], asOf: TODAY, today: TODAY, mode: 'availability', matches: [], highlightIds: null, modifiedIds: new Set(), selectedSuiteId: null,
    })
    for (const b of buildingLayout(model).suites) {
      const f = footprint([b])!
      expect(inside(interiorLook(f).eye, f)).toBe(true)
    }
  })
})

describe('lookTarget', () => {
  it('turns with yaw (+ towards +x) and pitch, one unit ahead', () => {
    const t = lookTarget([0, 0, 0], 90, 0)
    expect(t[0]).toBeCloseTo(1, 6)
    expect(t[2]).toBeCloseTo(0, 6)
    const up = lookTarget([0, 0, 0], 0, 90)
    expect(up[1]).toBeCloseTo(1, 6)
  })

  it('writes into the array it is given (no allocation per frame)', () => {
    const out: [number, number, number] = [0, 0, 0]
    expect(lookTarget([1, 2, 3], 0, 0, out)).toBe(out)
    expect(out).toEqual([1, 2, 4])
  })
})

describe('panYaw', () => {
  it('sweeps ±PAN_DEG once over PAN_MS and comes back to the facade view', () => {
    expect(panYaw(0)).toBeCloseTo(0, 6)
    expect(panYaw(PAN_MS / 4)).toBeCloseTo(PAN_DEG, 6)
    expect(panYaw((3 * PAN_MS) / 4)).toBeCloseTo(-PAN_DEG, 6)
    expect(panYaw(PAN_MS)).toBeCloseTo(0, 6)
    expect(panYaw(PAN_MS * 3)).toBe(0)
    expect(panYaw(-100)).toBe(0)
  })
})

describe('clampLook', () => {
  it('keeps a dragged look within its limits', () => {
    expect(clampLook(200, -90)).toEqual({ yaw: LOOK_LIMITS.yaw, pitch: LOOK_LIMITS.pitchMin })
    expect(clampLook(-200, 90)).toEqual({ yaw: -LOOK_LIMITS.yaw, pitch: LOOK_LIMITS.pitchMax })
    expect(clampLook(10, -5)).toEqual({ yaw: 10, pitch: -5 })
  })
})

describe('exterior shot', () => {
  const building = { min: [-10, 0, -5] as [number, number, number], max: [10, 30.5, 5] as [number, number, number] }

  it('frames a band of floors around the stop, the building\'s full width, within the building', () => {
    const f = footprint([box({ y: 15.5 })])!
    const b = exteriorBounds(f, building)
    expect(b.min[0]).toBe(-10)
    expect(b.max[0]).toBe(10)
    expect(b.min[1]).toBeLessThan(f.floor)
    expect(b.max[1]).toBeGreaterThan(f.floor + 0.87)
    expect(b.max[1] - b.min[1]).toBeLessThan(8)
    const low = exteriorBounds(footprint([box({ y: 0.8 })])!, building)
    expect(low.min[1]).toBe(0)
  })

  it('comes round to the side the stop is on, never past the orbit limit', () => {
    const right = exteriorView(footprint([box({ x: 8 })])!, building)
    const left = exteriorView(footprint([box({ x: -8 })])!, building)
    expect(right.azimuth).toBeGreaterThan(left.azimuth)
    expect(Math.abs(right.azimuth)).toBeLessThanOrEqual(30)
    expect(right.elevation).toBeGreaterThan(0)
  })
})
