import { describe, expect, it } from 'vitest'
import { DEPTH, LIFT, PLINTH_H, SLAB_T } from '../layout3d'
import { cityPlan, type Site } from './plan'
import { CAR, RAMP, cityTraffic, poseAt, routeLength, type Mover } from './traffic'
import { figureAt } from './walk'

const SITE: Site = { halfW: 9.66, halfD: 4.76, height: 12.4 }
const IDS = ['odt', 'pbp', 'bsp', 'mgc', 'fex', 'tall', 'x']
const TIMES = [0, 0.4, 3.3, 17, 61.7, 240, 1234.5]

const trafficOf = (id: string) => cityTraffic(id, cityPlan(id, SITE))

/** Distance from a point to the segment a→b, in plan (x, z). */
function offRoute(m: Mover, x: number, z: number): number {
  const [ax, az] = m.route.from
  const [bx, bz] = m.route.to
  const L2 = (bx - ax) ** 2 + (bz - az) ** 2
  const k = Math.min(Math.max(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2, 0), 1)
  return Math.hypot(x - (ax + k * (bx - ax)), z - (az + k * (bz - az)))
}

describe('cityTraffic', () => {
  it('has 4–8 cars and 8–14 pedestrians, the same for the same id', () => {
    for (const id of IDS) {
      const t = trafficOf(id)
      expect(t.cars.length, id).toBeGreaterThanOrEqual(4)
      expect(t.cars.length, id).toBeLessThanOrEqual(8)
      expect(t.people.length, id).toBeGreaterThanOrEqual(8)
      expect(t.people.length, id).toBeLessThanOrEqual(14)
      expect(trafficOf(id)).toEqual(t)
    }
  })

  it('cars drive in lanes on the roads; pedestrians walk the pavements', () => {
    const plan = cityPlan('odt', SITE)
    const t = cityTraffic('odt', plan)
    const roads = plan.roads
    for (const c of t.cars) {
      const [ax, az] = c.route.from
      const [bx, bz] = c.route.to
      const road = roads.find((r) => (r.axis === 'x' ? az === bz && Math.abs(az - r.at) < r.width / 2 : ax === bx && Math.abs(ax - r.at) < r.width / 2))
      expect(road, 'a car on a road').toBeDefined()
      const off = road ? Math.abs((road.axis === 'x' ? az : ax) - road.at) : 0
      expect(off).toBeCloseTo((road?.width ?? 0) / 4) // the middle of a lane, one each side of the centre line
    }
    for (const p of t.people) {
      const [ax, az] = p.route.from
      const [bx, bz] = p.route.to
      const onPavement = roads.some((r) => {
        const off = r.axis === 'x' ? (az === bz ? Math.abs(az - r.at) : -1) : (ax === bx ? Math.abs(ax - r.at) : -1)
        return off > r.width / 2 && off < r.width / 2 + 1
      })
      expect(onPavement, 'a pedestrian on a pavement').toBe(true)
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
          if (a.route.from.join() !== b.route.from.join() || a.route.to.join() !== b.route.to.join()) return
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
