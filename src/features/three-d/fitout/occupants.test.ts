import { describe, it, expect } from 'vitest'
import { poseAt } from '../city/traffic'
import { DEPTH } from '../layout3d'
import { bayMiddle, APPROACH, type Footprint } from '../tourCamera'
import { fitOut } from './fitOut'
import { PERSON_R } from './occupants'
import { grow, overlaps, rectAt, within } from './rect'

const foot = (x0: number, x1: number): Footprint => ({ x0, x1, z0: -DEPTH / 2, z1: DEPTH / 2, floor: 7.38 })
const CASES: [string, { foot: Footprint; sf: number; seed: string }][] = [
  ['tiny', { foot: foot(0, 0.5), sf: 350, seed: 'a' }],
  ['small', { foot: foot(-2, -0.87), sf: 800, seed: 'b' }],
  ['mid', { foot: foot(-3, 3.2), sf: 4300, seed: 'c' }],
  ['large', { foot: foot(-9, 9), sf: 12400, seed: 'd' }],
]

/** Distance from (x, z) to the segment a–b. */
function toSegment(x: number, z: number, a: [number, number], b: [number, number]): number {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]]
  const k = Math.min(Math.max(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0), 1)
  return Math.hypot(x - (a[0] + dx * k), z - (a[1] + dz * k))
}

describe('occupants', () => {
  it.each(CASES)('%s: everyone stays inside the room and clear of every item, walking for a minute', (_n, input) => {
    const r = fitOut(input)
    const room = grow(r.plan.inner, -PERSON_R)
    for (const m of r.people) {
      for (let t = 0; t <= 60; t += 0.25) {
        const p = poseAt(m, t)
        const body = rectAt(p.x, p.z, 2 * PERSON_R, 2 * PERSON_R)
        expect(within(rectAt(p.x, p.z, 0, 0), room)).toBe(true)
        for (const it of r.items) expect(overlaps(body, it.rect), `${it.kind} at t ${t}`).toBe(false)
      }
    }
  })

  it.each(CASES)('%s: walkers keep their distance from the viewer, and stand clear of the camera\'s way in before it arrives', (_n, input) => {
    const r = fitOut(input)
    const { eye, door } = r.plan
    const path: [number, number] = [bayMiddle(input.foot), input.foot.z1 + APPROACH]
    for (const m of r.people) {
      for (let t = 0; t <= 60; t += 0.25) {
        const p = poseAt(m, t)
        expect(Math.hypot(p.x - eye.x, p.z - eye.z)).toBeGreaterThan(0.6)
      }
      const p0 = poseAt(m, 0)
      expect(toSegment(p0.x, p0.z, path, [eye.x, eye.z])).toBeGreaterThan(0.2)
      expect(Math.abs(p0.x - door.x) + Math.abs(p0.z - r.plan.corridorZ)).toBeGreaterThan(0.2)
    }
  })

  it('the count follows the suite\'s size, capped, and some stand while others walk', () => {
    const counts = CASES.map(([, c]) => fitOut(c).people.length)
    counts.slice(1).forEach((n, i) => expect(n).toBeGreaterThanOrEqual(counts[i]!))
    expect(Math.max(...counts)).toBeLessThanOrEqual(12)
    const mid = fitOut(CASES[2]![1])
    expect(mid.people.some((m) => m.speed === 0)).toBe(true)
    expect(mid.people.some((m) => m.speed > 0)).toBe(true)
    for (const m of mid.people) expect(m.speed).toBeLessThan(0.35) // a walking pace (< 1.4 m/s)
  })

  it('people move over time (the walkers), the same way every time', () => {
    const r = fitOut(CASES[2]![1])
    const walker = r.people.find((m) => m.speed > 0)!
    expect(poseAt(walker, 0)).not.toEqual(poseAt(walker, 2))
    expect(fitOut(CASES[2]![1]).people).toEqual(r.people)
  })
})
