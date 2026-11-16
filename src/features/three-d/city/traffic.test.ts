import { describe, expect, it } from 'vitest'
import { DEPTH, LIFT, PLINTH_H, SLAB_T } from '../layout3d'
import { PAVE, cityPlan, roadRects, type Site } from './plan'
import { CAR, RAMP, cityTraffic, lapLength, poseAt, routeLength, type Mover } from './traffic'
import { figureAt } from './walk'

const SITE: Site = { halfW: 9.66, halfD: 4.76, height: 12.4 }
const IDS = ['odt', 'pbp', 'bsp', 'mgc', 'fex', 'tall', 'x']
const TIMES = [0, 0.4, 3.3, 17, 61.7, 240, 1234.5]

const trafficOf = (id: string) => cityTraffic(id, cityPlan(id, SITE))

type P = [number, number]

/** A route's legs as [from, to] pairs, the closing leg included for a loop. */
function legs(m: Mover): [P, P][] {
  const pts = m.route.points
  const open = pts.slice(1).map((b, i) => [pts[i] as P, b] as [P, P])
  const last = pts[pts.length - 1]
  const first = pts[0]
  return m.route.kind === 'loop' && last && first ? [...open, [last, first]] : open
}

/** Distance from a point to the route, in plan (x, z). */
function offRoute(m: Mover, x: number, z: number): number {
  return Math.min(...legs(m).map(([[ax, az], [bx, bz]]) => {
    const L2 = (bx - ax) ** 2 + (bz - az) ** 2
    const k = L2 === 0 ? 0 : Math.min(Math.max(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2, 0), 1)
    return Math.hypot(x - (ax + k * (bx - ax)), z - (az + k * (bz - az)))
  }))
}

const routeKey = (m: Mover) => JSON.stringify(m.route)

describe('cityTraffic', () => {
  it('has 4–8 cars and 40–60 pedestrians, the same for the same id', () => {
    for (const id of IDS) {
      const t = trafficOf(id)
      expect(t.cars.length, id).toBeGreaterThanOrEqual(4)
      expect(t.cars.length, id).toBeLessThanOrEqual(8)
      expect(t.people.length, id).toBeGreaterThanOrEqual(40)
      expect(t.people.length, id).toBeLessThanOrEqual(60)
      expect(trafficOf(id)).toEqual(t)
    }
  })

  it('2–3 people stand still and a few walk in pairs', () => {
    for (const id of IDS) {
      const people = trafficOf(id).people
      const standing = people.filter((m) => m.speed === 0).length
      expect(standing, id).toBeGreaterThanOrEqual(2)
      expect(standing, id).toBeLessThanOrEqual(3)
      const pairs = people.filter((a, i) => a.speed > 0 && people.slice(i + 1).some((b) => routeKey(a) === routeKey(b) && a.speed === b.speed
        && Math.abs(a.offset - b.offset) * lapLength(a.route) < 1.2))
      expect(pairs.length, id).toBeGreaterThanOrEqual(2)
    }
  })

  it('people stay on the pavements: never on a road with cars, never inside our plinth', () => {
    for (const id of IDS) {
      const plan = cityPlan(id, SITE)
      const lanes = roadRects(plan.roads.filter((r) => r.traffic))
      for (const m of trafficOf(id).people) for (let time = 0; time < 400; time += 2.3) {
        const p = poseAt(m, time)
        const onRoad = lanes.some((r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1)
        expect(onRoad, `${id} on a road`).toBe(false)
        expect(Math.abs(p.x) < SITE.halfW && Math.abs(p.z) < SITE.halfD, `${id} in the plinth`).toBe(false)
      }
    }
  })

  it('cars drive in lanes on the roads; pedestrians walk the pavements', () => {
    const plan = cityPlan('odt', SITE)
    const t = cityTraffic('odt', plan)
    const roads = plan.roads
    for (const c of t.cars) {
      const [[ax, az], [bx, bz]] = c.route.points as [P, P]
      const road = roads.find((r) => (r.axis === 'x' ? az === bz && Math.abs(az - r.at) < r.width / 2 : ax === bx && Math.abs(ax - r.at) < r.width / 2))
      expect(road, 'a car on a road').toBeDefined()
      const off = road ? Math.abs((road.axis === 'x' ? az : ax) - road.at) : 0
      expect(off).toBeCloseTo((road?.width ?? 0) / 4) // the middle of a lane, one each side of the centre line
    }
    for (const p of t.people) {
      for (const [[ax, az], [bx, bz]] of legs(p)) {
        const onPavement = roads.some((r) => {
          const off = r.axis === 'x' ? (az === bz ? Math.abs(az - r.at) : -1) : (ax === bx ? Math.abs(ax - r.at) : -1)
          return off > r.width / 2 && off < r.width / 2 + PAVE
        })
        expect(onPavement, 'every leg of a walk is on a pavement').toBe(true)
      }
    }
  })
})

describe('poseAt', () => {
  it('is a pure function of time and never leaves the route', () => {
    for (const m of [...trafficOf('odt').cars, ...trafficOf('odt').people]) {
      for (const time of TIMES) {
        const p = poseAt(m, time)
        expect(poseAt(m, time)).toEqual(p)
        expect(offRoute(m, p.x, p.z)).toBeLessThan(1e-6)
        expect(p.scale).toBeGreaterThanOrEqual(0)
        expect(p.scale).toBeLessThanOrEqual(1)
      }
    }
  })

  it('loops seamlessly: one lap later it is in the same place, and it shrinks to nothing where the lap joins', () => {
    const m = trafficOf('odt').cars[0]
    if (!m) throw new Error('no car')
    const lap = routeLength(m.route) / m.speed
    for (const time of TIMES) {
      const a = poseAt(m, time)
      const b = poseAt(m, time + lap)
      expect(b.x).toBeCloseTo(a.x, 6)
      expect(b.z).toBeCloseTo(a.z, 6)
    }
    // Just before and just after the joint the mover is (nearly) invisible, so the jump back cannot be seen.
    const joint = (1 - m.offset) * lap
    expect(poseAt(m, joint - 1e-3).scale).toBeLessThan(0.01)
    expect(poseAt(m, joint + 1e-3).scale).toBeLessThan(0.01)
    expect(poseAt(m, joint + RAMP / m.speed + 1).scale).toBe(1)
  })

  it('a loop (the pavement rings) never shrinks and joins up: one lap later it is in the same place', () => {
    const m = trafficOf('odt').people.find((p) => p.route.kind === 'loop' && p.speed > 0)
    if (!m) throw new Error('no one on a loop')
    const lap = lapLength(m.route) / m.speed
    for (const time of TIMES) {
      const a = poseAt(m, time)
      const b = poseAt(m, time + lap)
      expect(a.scale).toBe(1)
      expect(b.x).toBeCloseTo(a.x, 6)
      expect(b.z).toBeCloseTo(a.z, 6)
    }
  })

  it('turns the corners of a loop: it faces along each leg', () => {
    const m = trafficOf('odt').people.find((p) => p.route.kind === 'loop' && p.speed > 0)
    if (!m) throw new Error('no one on a loop')
    const headings = new Set(Array.from({ length: 400 }, (_, i) => Math.round((poseAt(m, i * 0.7).heading * 180) / Math.PI)))
    expect(headings.size).toBe(4)
  })

  it('faces the way it moves', () => {
    const m = trafficOf('odt').cars[0]
    if (!m) throw new Error('no car')
    const a = poseAt(m, 10)
    const b = poseAt(m, 10.1)
    expect(Math.sin(a.heading)).toBeCloseTo(Math.sign(b.x - a.x) * Math.abs(Math.sin(a.heading)), 6)
    expect(Math.cos(a.heading)).toBeCloseTo(Math.sign(b.z - a.z) * Math.abs(Math.cos(a.heading)), 6)
  })

  it('no two cars in one lane ever overlap', () => {
    for (const id of IDS) {
      const cars = trafficOf(id).cars
      for (const time of [...TIMES, ...Array.from({ length: 50 }, (_, i) => i * 7.3)]) {
        cars.forEach((a, i) => cars.slice(i + 1).forEach((b) => {
          if (routeKey(a) !== routeKey(b)) return
          const pa = poseAt(a, time)
          const pb = poseAt(b, time)
          expect(Math.hypot(pa.x - pb.x, pa.z - pb.z), id).toBeGreaterThan(CAR.length)
        }))
      }
    }
  })

  it('cars and people in front of the building stay below every sightline to the lowest labels (elevation ≥ 3°)', () => {
    const facade = DEPTH / 2 + LIFT
    const lowest = PLINTH_H + SLAB_T
    const line = (z: number) => lowest + (z - facade) * Math.tan((3 * Math.PI) / 180)
    const t = trafficOf('odt')
    for (const m of t.cars) for (let time = 0; time < 200; time += 1.7) {
      const p = poseAt(m, time)
      if (p.z > facade) expect(CAR.top * p.scale).toBeLessThan(line(p.z))
    }
    for (const m of t.people) for (let time = 0; time < 200; time += 1.7) {
      const f = figureAt(m, time) // the whole figure: its own height (with the hip's bob never raising it)
      if (f.z > facade) expect(f.height * f.scale).toBeLessThan(line(f.z))
    }
  })
})
