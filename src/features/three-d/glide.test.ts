import { describe, it, expect } from 'vitest'
import type { Pose } from './camera'
import { MAX_ZOOM_IN, MAX_ZOOM_OUT, OPEN_LIMITS, glideAt, limitsAfter, limitsDuring, limitsFor, retarget, tourGlideAt, type Glide, type TourGlide } from './glide'

const pose = (x: number, d: number): Pose => ({ position: [x, 10, 40], target: [x, 5, 0], distance: d })
const from = { position: [0, 20, 80] as [number, number, number], target: [0, 4, 0] as [number, number, number] }
/** A glide between two framings (into, out of or within floor view), 400 ms from t = 1000. */
const modeGlide: Glide = { from, to: pose(6, 60), start: 1000, ms: 400, limit: 60 }
/** The glide back to framing after an orbit: it never touches the zoom limits. */
const settleGlide: Glide = { ...modeGlide, limit: null }

describe('limitsFor', () => {
  it('lets the camera zoom in to 30% and out to 170% of the framing distance', () => {
    expect(limitsFor(100)).toEqual({ min: 100 * MAX_ZOOM_IN, max: 100 * MAX_ZOOM_OUT })
  })
})

describe('glideAt', () => {
  it('starts where the camera was and ends on the new pose', () => {
    expect(glideAt(modeGlide, 1000)).toEqual({ ...from, done: false })
    const end = glideAt(modeGlide, 1400)
    expect(end).toEqual({ position: modeGlide.to.position, target: modeGlide.to.target, done: true })
    expect(glideAt(modeGlide, 5000).done).toBe(true)
  })

  it('eases out: past half-way at half the time', () => {
    const mid = glideAt(modeGlide, 1200)
    expect(mid.done).toBe(false)
    expect(mid.target[0]).toBeGreaterThan(3)
    expect(mid.target[0]).toBeLessThan(6)
  })
})

describe('zoom limits around a glide', () => {
  it('a glide between framings opens the limits while it runs, so it is not clamped half-way', () => {
    expect(limitsDuring(modeGlide)).toEqual(OPEN_LIMITS)
  })

  it('restores the limits of the new framing when it finishes', () => {
    expect(glideAt(modeGlide, 1400).done).toBe(true)
    expect(limitsAfter(modeGlide)).toEqual(limitsFor(60))
  })

  it('restores them when it is cut short: by a drag or a button, by a new floor, or by leaving floor view', () => {
    // Stopped half-way (drag or button press): the glide's own framing limits, never left open.
    expect(glideAt(modeGlide, 1200).done).toBe(false)
    expect(limitsAfter(modeGlide)).toEqual(limitsFor(60))
    // A new floor, or leaving floor view, replaces it with a glide whose own limits apply at its end.
    const next: Glide = { from: glideAt(modeGlide, 1200), to: pose(-2, 90), start: 1200, ms: 400, limit: 90 }
    expect(limitsDuring(next)).toEqual(OPEN_LIMITS)
    expect(limitsAfter(next)).toEqual(limitsFor(90))
    expect(Number.isFinite(limitsAfter(next)?.max)).toBe(true)
  })

  it('a settle glide and no glide leave the limits alone', () => {
    expect(limitsDuring(settleGlide)).toBeNull()
    expect(limitsAfter(settleGlide)).toBeNull()
    expect(limitsAfter(null)).toBeNull()
  })
})

describe('retarget', () => {
  it('a refit during a glide between framings moves its end and keeps its progress (no snap)', () => {
    const moved = retarget(modeGlide, pose(9, 80), 80)
    expect(moved).not.toBeNull()
    if (!moved) return
    expect(moved.start).toBe(modeGlide.start)
    expect(moved.from).toEqual(modeGlide.from)
    expect(glideAt(moved, 1000)).toEqual(glideAt(modeGlide, 1000))
    expect(glideAt(moved, 1400).target).toEqual(pose(9, 80).target)
    expect(limitsAfter(moved)).toEqual(limitsFor(80))
  })

  it('does not take over a settle glide (a refit then places the camera at once, as before)', () => {
    expect(retarget(settleGlide, pose(9, 80), 80)).toBeNull()
  })
})

describe('tourGlideAt', () => {
  const shot = (x: number, fov: number) => ({ position: [x, 1, 2] as [number, number, number], target: [x, 0, 9] as [number, number, number], fov })
  const flight: TourGlide = { from: shot(0, 20), to: shot(10, 60), start: 1000, ms: 1000 }

  it('carries position, aim and lens together from start to end, eased in and out', () => {
    const out = shot(0, 0)
    expect(tourGlideAt(flight, 1000, out)).toBe(false)
    expect(out).toEqual(shot(0, 20))
    tourGlideAt(flight, 1250, out)
    expect(out.position[0]).toBeLessThan(2.5) // slow out of the start
    tourGlideAt(flight, 1500, out)
    expect(out.position[0]).toBeCloseTo(5, 6)
    expect(out.fov).toBeCloseTo(40, 6)
    expect(tourGlideAt(flight, 2000, out)).toBe(true)
    expect(out).toEqual(shot(10, 60))
  })

  it('writes into the shot it is given (no allocation per frame)', () => {
    const out = shot(0, 0)
    const { position, target } = out
    tourGlideAt(flight, 1300, out)
    expect(out.position).toBe(position)
    expect(out.target).toBe(target)
  })

  it('a zero-length flight arrives at once', () => {
    const out = shot(0, 0)
    expect(tourGlideAt({ ...flight, ms: 0 }, 1000, out)).toBe(true)
    expect(out).toEqual(shot(10, 60))
  })

  it('by way of a point: through it, on to the end, and still eased from rest to rest', () => {
    const via = { point: [5, 1, 20] as [number, number, number], control: [5, 1, 30] as [number, number, number], k: 0.5 }
    const out = shot(0, 0)
    tourGlideAt({ ...flight, via }, 1000, out)
    expect(out.position).toEqual(shot(0, 20).position)
    tourGlideAt({ ...flight, via }, 1500, out) // eased half way: the point
    expect(out.position[0]).toBeCloseTo(5, 6)
    expect(out.position[2]).toBeCloseTo(20, 6)
    expect(tourGlideAt({ ...flight, via }, 2000, out)).toBe(true)
    expect(out.position).toEqual(shot(10, 60).position)
  })
})
