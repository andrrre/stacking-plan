import { describe, it, expect } from 'vitest'
import { buildStackModel } from '../stack/suiteVisual'
import { BUNDLED_BUILDINGS } from '../../data'
import { cityPlan } from './city/plan'
import { tourGlideAt, type Shot } from './glide'
import { DEPTH, PITCH, SLAB_T, SUITE_H, buildingLayout, floorLayout, type SuiteBox } from './layout3d'
import {
  APPROACH, ENTER_MS, EXIT_MS, EXTERIOR_NEAR, EYE_HEIGHT, FLY_MS, INTERIOR_NEAR, LOOK_LIMITS, PAN_MS, PAN_TURN, STOP_MS, bayMiddle, clampLook,
  enterVia, entryX, exteriorBounds, exteriorView, footprint, interiorLook, lookTarget, nearFor, panYaw,
} from './tourCamera'
import { columnXs } from './tourRoom'

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
  it('turns once all the way round over PAN_MS, slowly at both ends, and comes back to the window view', () => {
    expect(PAN_TURN).toBe(360)
    expect(panYaw(0)).toBeCloseTo(0, 6)
    expect(panYaw(PAN_MS / 4)).toBeGreaterThan(0)
    expect(panYaw(PAN_MS / 4)).toBeLessThan(PAN_TURN / 4) // eased in
    expect(panYaw(PAN_MS / 2)).toBeCloseTo(PAN_TURN / 2, 6)
    expect(panYaw((3 * PAN_MS) / 4)).toBeGreaterThan((3 * PAN_TURN) / 4)
    expect(panYaw(PAN_MS)).toBe(PAN_TURN)
    expect(panYaw(PAN_MS * 3)).toBe(PAN_TURN) // done: a full turn, not a jump back
    expect(panYaw(-100)).toBe(0)
  })

  it('only ever turns one way (monotonic) and never faster than a slow walk round (< 45°/s)', () => {
    let last = panYaw(0)
    for (let ms = 50; ms <= PAN_MS; ms += 50) {
      const y = panYaw(ms)
      expect(y).toBeGreaterThanOrEqual(last)
      expect(((y - last) / 50) * 1000).toBeLessThan(45)
      last = y
    }
  })

  it('a stop that plays on its own lasts the flights, the whole turn and time to read the caption', () => {
    expect(STOP_MS).toBeGreaterThan(FLY_MS + ENTER_MS + PAN_MS)
    expect(STOP_MS - (FLY_MS + ENTER_MS + PAN_MS)).toBeGreaterThanOrEqual(2000)
    expect(EXIT_MS).toBeLessThan(STOP_MS)
  })
})

describe('clampLook', () => {
  it('leaves the turn free all the way round, either way, and holds the pitch between its limits', () => {
    expect(clampLook(200, -90)).toEqual({ yaw: 200, pitch: LOOK_LIMITS.pitchMin })
    expect(clampLook(-725, 90)).toEqual({ yaw: -725, pitch: LOOK_LIMITS.pitchMax })
    expect(clampLook(10, -5)).toEqual({ yaw: 10, pitch: -5 })
    expect(LOOK_LIMITS.pitchMin).toBeGreaterThanOrEqual(-60) // never straight down at the feet
    expect(LOOK_LIMITS.pitchMax).toBeLessThanOrEqual(45) // nor straight up at the ceiling
  })
})

describe('entryX: where the way in crosses a depth', () => {
  it('at the approach point it is the bay middle, at the eye the eye\'s x, and in between on the straight line', () => {
    const f = footprint([box({ x: 1, w: 2.4 })])!
    const eye = interiorLook(f).eye
    expect(entryX(f, f.z1 + APPROACH)).toBeCloseTo(bayMiddle(f), 9)
    expect(entryX(f, eye[2])).toBeCloseTo(eye[0], 9)
    const mid = entryX(f, (f.z1 + APPROACH + eye[2]) / 2)
    expect(mid).toBeCloseTo((bayMiddle(f) + eye[0]) / 2, 9)
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

const heroModel = () => buildStackModel({
  building: BUNDLED_BUILDINGS[0], asOf: TODAY, today: TODAY, mode: 'availability', matches: [], highlightIds: null, modifiedIds: new Set(), selectedSuiteId: null,
})

describe('the stop\'s floor between the flight out and the room', () => {
  it('a suite\'s footprint is the same in the whole building (flying to it) and in its floor opened (inside it)', () => {
    for (const b of BUNDLED_BUILDINGS) {
      const model = buildStackModel({
        building: b, asOf: TODAY, today: TODAY, mode: 'availability', matches: [], highlightIds: null, modifiedIds: new Set(), selectedSuiteId: null,
      })
      const whole = buildingLayout(model, 0)
      for (const f of model.floors) {
        const opened = floorLayout(model, f.number)
        for (const v of f.suites) {
          const a = footprint(whole.suites.filter((x) => x.id === v.suite.id))
          const c = footprint(opened.suites.filter((x) => x.id === v.suite.id))
          expect(c).toEqual(a)
        }
      }
    }
  })
})

describe('nearFor', () => {
  const f = footprint([box({ x: 0, w: 2 })])!
  const mid = (f.floor + SUITE_H / 2)

  it('in the room, or close enough to its walls for the near plane to clip them: the interior near plane', () => {
    expect(nearFor([0, f.floor + EYE_HEIGHT, -1], f)).toBe(INTERIOR_NEAR)
    expect(nearFor([0, mid, f.z1 + EXTERIOR_NEAR], f)).toBe(INTERIOR_NEAR) // just out of the facade
  })

  it('anywhere else, and with no room: the exterior one (depth stays precise out to the far plane)', () => {
    expect(nearFor([0, mid, f.z1 + 5], f)).toBe(EXTERIOR_NEAR)
    expect(nearFor([0, f.floor + SUITE_H + 3, 0], f)).toBe(EXTERIOR_NEAR) // over the roof
    expect(nearFor([0, f.floor + EYE_HEIGHT, -1], null)).toBe(EXTERIOR_NEAR)
  })
})

describe('enterVia: the flight into the suite', () => {
  const cases: [string, SuiteBox[]][] = [
    ['a narrow suite between neighbours', [box({ x: -2, w: 0.45 })]],
    ['a suite with a column at its centre (two bays)', [box({ x: 1, w: 2.4 })]],
    ['a wide suite', [box({ x: 0, w: 14 })]],
    ['a two-suite option', [box({ x: 1, w: 2 }), box({ x: 3.1, w: 2.2 })]],
  ]
  const outside: Shot = { position: [14, 12, 60], target: [0, 7, 0], fov: 20 }

  it.each(cases)('%s: comes in square to the facade, between two columns, inside the suite\'s width', (_name, boxes) => {
    const f = footprint(boxes)!
    const look = interiorLook(f)
    const to: Shot = { position: [...look.eye], target: lookTarget(look.eye, look.yaw, look.pitch), fov: 60 }
    const via = enterVia(outside.position, f, look.eye)
    const flight = { from: outside, to, start: 0, ms: ENTER_MS, via }
    const out: Shot = { position: [0, 0, 0], target: [0, 0, 0], fov: 0 }
    const columns = columnXs(f.x0, f.x1)
    let crossed = false
    let last: number[] = [...outside.position]
    for (let t = 0; t <= ENTER_MS; t += 4) {
      tourGlideAt(flight, t, out)
      const p = out.position
      expect(Math.hypot(p[0] - last[0]!, p[1] - last[1]!, p[2] - last[2]!)).toBeLessThan(1.5) // no jump
      if (!crossed && p[2] <= f.z1 + 0.3) { // within reach of the facade, and from there in
        crossed = true
      }
      if (crossed) {
        expect(p[0]).toBeGreaterThan(f.x0 + 0.05)
        expect(p[0]).toBeLessThan(f.x1 - 0.05)
        expect(p[1]).toBeGreaterThan(f.floor)
        expect(p[1]).toBeLessThan(f.floor + SUITE_H)
        if (Math.abs(p[2] - f.z1) < 0.1) for (const c of columns) expect(Math.abs(p[0] - c)).toBeGreaterThan(0.1)
      }
      last = [...p]
    }
    expect(crossed).toBe(true)
    out.position.forEach((v, i) => expect(v).toBeCloseTo(to.position[i]!, 9))
  })

  it('on the real hero building, every suite\'s way in passes no neighbour', () => {
    const layout = buildingLayout(heroModel())
    for (const b of layout.suites) {
      const f = footprint([b])!
      const via = enterVia(outside.position, f, interiorLook(f).eye)
      expect(via.point[0]).toBeGreaterThan(f.x0)
      expect(via.point[0]).toBeLessThan(f.x1)
      expect(via.point[2]).toBeGreaterThan(f.z1)
    }
  })
})
