import { describe, it, expect } from 'vitest'
import { DEPTH } from '../layout3d'
import { entryX, interiorLook, type Footprint } from '../tourCamera'
import { overlaps, rectD, rectW, within } from './rect'
import { CORRIDOR, DOOR, roomPlan } from './roomPlan'

const foot = (x0: number, x1: number): Footprint => ({ x0, x1, z0: -DEPTH / 2, z1: DEPTH / 2, floor: 7.38 })

describe('roomPlan', () => {
  const cases: [string, Footprint][] = [
    ['a tiny suite', foot(0, 0.5)],
    ['a small suite', foot(-2, -0.9)],
    ['a mid suite', foot(-3, 3.2)],
    ['a whole floor', foot(-9, 9)],
  ]

  it.each(cases)('%s: the corridor runs along the street front, the room inside its walls behind it', (_n, f) => {
    const p = roomPlan(f)
    expect(p.corridorZ).toBeCloseTo(f.z1 - CORRIDOR, 9)
    expect(p.inner.x0).toBeGreaterThan(f.x0)
    expect(p.inner.x1).toBeLessThan(f.x1)
    expect(p.inner.z0).toBeGreaterThan(f.z0)
    expect(p.inner.z1).toBeLessThan(p.corridorZ)
  })

  it.each(cases)('%s: the entrance door is in the corridor wall, inside the room\'s width, where the way in crosses it when it fits', (_n, f) => {
    const p = roomPlan(f)
    expect(p.door.x - DOOR.w / 2).toBeGreaterThanOrEqual(p.inner.x0 - 1e-9)
    expect(p.door.x + DOOR.w / 2).toBeLessThanOrEqual(p.inner.x1 + 1e-9)
    if (rectW(p.inner) > 1) expect(p.door.x).toBeCloseTo(entryX(f, p.corridorZ), 9)
  })

  it.each(cases)('%s: the aisles and the eye\'s clear zone lie inside the room; the eye is in its clear zone', (_n, f) => {
    const p = roomPlan(f)
    for (const l of p.lanes) expect(within(l, p.inner)).toBe(true)
    const eye = interiorLook(f).eye
    expect(p.eye).toEqual({ x: eye[0], z: eye[2] })
    expect(p.keep.x0 < eye[0] && eye[0] < p.keep.x1 && p.keep.z0 < eye[2] && eye[2] < p.keep.z1).toBe(true)
  })

  it('the open-plan zone lies between the window aisle and the cross aisle; the front zone along the corridor wall', () => {
    const p = roomPlan(foot(-3, 3.2))
    expect(p.desks.z0).toBeCloseTo(p.lanes.find((l) => l === p.window)!.z1, 9)
    expect(p.front.z1).toBeCloseTo(p.inner.z1, 9)
    expect(overlaps(p.front, p.desks)).toBe(false)
    expect(rectD(p.front)).toBeGreaterThan(1) // deep enough for a meeting room (≈ 5 m)
    expect(p.mid).not.toBeNull() // a deep floor gets a second cross aisle
  })
})
