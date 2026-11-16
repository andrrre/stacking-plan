import { describe, expect, it } from 'vitest'
import { cityPlan } from './plan'
import { cityTraffic, lapLength, poseAt, routeLength, type Mover } from './traffic'
import { FIGURE, figureAt, strideOf } from './walk'

const all = cityTraffic('odt', cityPlan('odt', { halfW: 9.66, halfD: 4.76, height: 12.4 })).people
const people = all.filter((m) => m.speed > 0) // walking; the few standing are tested on their own
const TIMES = [0, 0.37, 2.9, 15.1, 88.8, 431.2]
const someone = (): Mover => {
  const m = people[0]
  if (!m) throw new Error('no people')
  return m
}

describe('figureAt', () => {
  it('is a pure function of time and stands where poseAt puts the person', () => {
    for (const m of people) for (const t of TIMES) {
      const f = figureAt(m, t)
      expect(figureAt(m, t)).toEqual(f)
      const p = poseAt(m, t)
      expect([f.x, f.z, f.heading, f.scale]).toEqual([p.x, p.z, p.heading, p.scale])
    }
  })

  it('heights vary by person, up to 10% over the base figure (less where the sightline caps them), the same every time', () => {
    const heights = all.map((m) => figureAt(m, 0).height)
    for (const h of heights) {
      expect(h).toBeGreaterThanOrEqual(FIGURE.height * 0.75 - 1e-9)
      expect(h).toBeLessThanOrEqual(FIGURE.height * 1.1 + 1e-9)
    }
    expect(new Set(heights.map((h) => h.toFixed(4))).size).toBeGreaterThan(3)
  })

  it('legs swing opposite each other and the arms opposite the legs, within range', () => {
    for (const m of people) for (const t of TIMES) {
      const f = figureAt(m, t)
      expect(f.legs[0]).toBeCloseTo(-f.legs[1], 9)
      expect(f.arms[0]).toBeCloseTo(-f.arms[1], 9)
      expect(Math.abs(f.legs[0])).toBeLessThanOrEqual(FIGURE.swing + 1e-9)
      expect(Math.abs(f.arms[0])).toBeLessThanOrEqual(FIGURE.swing * FIGURE.armSwing + 1e-9)
      if (Math.abs(f.legs[0]) > 1e-6) expect(Math.sign(f.arms[0])).toBe(-Math.sign(f.legs[0])) // left arm forward with the right leg
    }
  })

  it('swings through a full stride: both extremes are reached over one cycle', () => {
    const m = someone()
    const cycle = strideOf(m) / m.speed
    const legs = Array.from({ length: 200 }, (_, i) => figureAt(m, 3 + (i / 200) * cycle).legs[0])
    expect(Math.max(...legs)).toBeCloseTo(FIGURE.swing, 2)
    expect(Math.min(...legs)).toBeCloseTo(-FIGURE.swing, 2)
  })

  it('keeps the feet on the ground: the hip bobs down exactly as much as the swung legs rise', () => {
    for (const m of people) for (const t of TIMES) {
      const f = figureAt(m, t)
      expect(f.bob).toBeLessThanOrEqual(0)
      for (const y of f.feet) expect(Math.abs(y)).toBeLessThan(1e-9)
    }
  })

  it('at mid-stance the legs hang straight and the hip is at full height', () => {
    const m = someone()
    const stride = strideOf(m)
    // Mid-stance: the distance walked is a whole number of half strides.
    const s0 = m.offset * lapLength(m.route)
    const k = Math.ceil(s0 / (stride / 2)) + 1
    const t = (k * (stride / 2) - s0) / m.speed
    const f = figureAt(m, t)
    expect(Math.abs(f.legs[0])).toBeLessThan(1e-6)
    expect(Math.abs(f.bob)).toBeLessThan(1e-9)
  })

  it('the stride fits the route a whole number of times, so a lap later the pose is the same', () => {
    for (const m of people) {
      const L = routeLength(m.route)
      expect(L / strideOf(m)).toBeCloseTo(Math.round(L / strideOf(m)), 9)
      const lap = lapLength(m.route) / m.speed
      for (const t of TIMES) {
        const a = figureAt(m, t)
        const b = figureAt(m, t + lap)
        expect(b.x).toBeCloseTo(a.x, 6)
        expect(b.z).toBeCloseTo(a.z, 6)
        expect(b.legs[0]).toBeCloseTo(a.legs[0], 6)
        expect(b.arms[0]).toBeCloseTo(a.arms[0], 6)
      }
    }
  })

  it('a stride is about as long as the legs allow, so the feet do not visibly slide', () => {
    for (const m of people) {
      const h = figureAt(m, 0).height
      const natural = 4 * FIGURE.leg * h * Math.sin(FIGURE.swing)
      expect(strideOf(m) / natural).toBeGreaterThan(0.95)
      expect(strideOf(m) / natural).toBeLessThan(1.05)
    }
  })

  it('someone standing still stands straight, hip at full height', () => {
    const standing = all.filter((m) => m.speed === 0)
    expect(standing.length).toBeGreaterThan(0)
    for (const m of standing) for (const t of TIMES) {
      const f = figureAt(m, t)
      for (const a of [...f.legs, ...f.arms]) expect(Math.abs(a)).toBe(0)
      expect(f.bob).toBe(0)
      expect([f.x, f.z]).toEqual([figureAt(m, 0).x, figureAt(m, 0).z])
    }
  })
})
