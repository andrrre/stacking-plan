import { describe, it, expect } from 'vitest'
import { DEPTH, SUITE_H } from '../layout3d'
import { APPROACH, bayMiddle, interiorLook, type Footprint } from '../tourCamera'
import { fitOut, MAX_PIECES, type Interior } from './fitOut'
import { grow, overlaps, planOf, within } from './rect'
import { DOOR } from './roomPlan'

const foot = (x0: number, x1: number): Footprint => ({ x0, x1, z0: -DEPTH / 2, z1: DEPTH / 2, floor: 7.38 })

// Sizes as the hero building lays them out (a 12,400 SF plate is 18 units wide).
const TINY = { foot: foot(0, 0.5), sf: 350, seed: 'odt-330' }
const SMALL = { foot: foot(-2, -0.87), sf: 800, seed: 'odt-330' }
const MID = { foot: foot(-3, 3.2), sf: 4300, seed: 'odt-700' }
const LARGE = { foot: foot(-9, 9), sf: 12400, seed: 'odt-600' }
const ALL: [string, typeof MID][] = [['tiny', TINY], ['small', SMALL], ['mid', MID], ['large', LARGE]]

const furniture = (r: Interior) => r.items
const seats = (r: Interior) => r.items.reduce((s, i) => s + i.seats, 0)

describe('fitOut', () => {
  it.each(ALL)('%s: the same suite always gets the same layout', (_n, input) => {
    expect(fitOut(input)).toEqual(fitOut({ ...input, foot: { ...input.foot } }))
  })

  it('another suite of the same size gets another layout', () => {
    const a = fitOut(MID)
    const b = fitOut({ ...MID, seed: 'odt-710' })
    expect(JSON.stringify(a.pieces)).not.toEqual(JSON.stringify(b.pieces))
  })

  it.each(ALL)('%s: every item lies inside the room\'s walls, and no two items overlap', (_n, input) => {
    const r = fitOut(input)
    for (const it of furniture(r)) expect(within(it.rect, r.plan.inner), it.kind).toBe(true)
    r.items.forEach((a, i) => r.items.slice(i + 1).forEach((b) => expect(overlaps(a.rect, b.rect), `${a.kind} / ${b.kind}`).toBe(false)))
  })

  it.each(ALL)('%s: no item stands in an aisle, by the eye, or in the entrance door\'s way', (_n, input) => {
    const r = fitOut(input)
    const door = { x0: r.plan.door.x - DOOR.w / 2, x1: r.plan.door.x + DOOR.w / 2, z0: r.plan.corridorZ - DOOR.w, z1: r.plan.corridorZ }
    for (const it of r.items) {
      for (const l of r.plan.lanes) expect(overlaps(it.rect, l), `${it.kind} in an aisle`).toBe(false)
      expect(overlaps(it.rect, r.plan.keep), `${it.kind} by the eye`).toBe(false)
      expect(overlaps(it.rect, door), `${it.kind} in the door`).toBe(false)
    }
  })

  it.each(ALL)('%s: every piece is within the suite, between its floor and ceiling', (_n, input) => {
    const r = fitOut(input)
    const f = input.foot
    for (const p of r.pieces) {
      expect(within(planOf(p), grow({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1 }, 0.03))).toBe(true)
      expect(p.y - p.h / 2).toBeGreaterThanOrEqual(f.floor - 1e-9)
      expect(p.y + p.h / 2).toBeLessThanOrEqual(f.floor + SUITE_H + 1e-9)
    }
  })

  it.each(ALL)('%s: the camera\'s way in (through the street glass and the open door to the eye) touches nothing', (_n, input) => {
    const r = fitOut(input)
    const f = input.foot
    const eye = interiorLook(f).eye
    const from = [bayMiddle(f), f.z1 + APPROACH]
    for (let k = 0; k <= 1; k += 0.005) {
      const x = from[0]! + (eye[0] - from[0]!) * k
      const z = from[1]! + (eye[2] - from[1]!) * k
      const near = { x0: x - 0.05, x1: x + 0.05, z0: z - 0.05, z1: z + 0.05 }
      for (const p of r.pieces) {
        const hit = overlaps(planOf(p), near) && p.y - p.h / 2 < eye[1] + 0.05 && p.y + p.h / 2 > eye[1] - 0.05
        expect(hit, `${p.tone} at ${p.x.toFixed(2)},${p.z.toFixed(2)} on the way in (k ${k.toFixed(3)})`).toBe(false)
      }
    }
  })

  it.each(ALL)('%s: two party walls, the corridor wall and its entrance door, and a ceiling of lights', (_n, input) => {
    const r = fitOut(input)
    expect(r.walls).toBeGreaterThanOrEqual(3)
    expect(r.doors).toBeGreaterThanOrEqual(1)
    const party = r.pieces.filter((p) => p.tone === 'party')
    expect(party).toHaveLength(2)
    for (const w of party) expect(w.d).toBeGreaterThan(DEPTH - 0.1)
    expect(r.pieces.some((p) => p.tone === 'light')).toBe(true)
  })

  it('a bigger suite gets more: seats, items and people, and the mid and large suites get glazed meeting rooms', () => {
    const [s, m, l] = [fitOut(SMALL), fitOut(MID), fitOut(LARGE)]
    expect(seats(s)).toBeLessThan(seats(m))
    expect(seats(m)).toBeLessThan(seats(l))
    expect(furniture(s).length).toBeLessThan(furniture(m).length)
    expect(s.people.length).toBeLessThanOrEqual(m.people.length)
    expect(m.people.length).toBeLessThan(l.people.length)
    for (const r of [m, l]) {
      expect(r.items.some((i) => i.kind === 'meeting')).toBe(true)
      expect(r.pieces.some((p) => p.tone === 'glass')).toBe(true)
      expect(r.items.some((i) => i.kind === 'reception')).toBe(true)
      expect(r.items.some((i) => i.kind === 'kitchen')).toBe(true)
      expect(r.items.some((i) => i.kind === 'lounge')).toBe(true)
      expect(r.items.filter((i) => i.kind === 'plant').length).toBeGreaterThanOrEqual(2)
    }
  })

  it.each(ALL)('%s: the party walls are dressed facing the viewer (skirting, a whiteboard, framed panels), clear of every item', (_n, input) => {
    const r = fitOut(input)
    expect(r.pieces.filter((p) => p.tone === 'frame' && p.h <= 0.03 && p.d > DEPTH - 0.2)).toHaveLength(2) // skirting, both walls
    for (const d of r.decor) for (const it of r.items) expect(overlaps(d, it.rect), it.kind).toBe(false)
  })

  it('a narrow suite: both side walls carry something on the viewer\'s line of sight, square across from the eye', () => {
    const r = fitOut(SMALL)
    const eye = r.plan.eye
    const left = r.decor.filter((d) => d.x0 <= r.plan.inner.x0 + 1e-9)
    const right = r.decor.filter((d) => d.x1 >= r.plan.inner.x1 - 1e-9)
    for (const side of [left, right]) {
      expect(side.length).toBeGreaterThan(0)
      expect(side.some((d) => d.z0 < eye.z && eye.z < d.z1)).toBe(true)
    }
  })

  it('a tiny suite degrades to a few things, still with its walls and door, and never errors', () => {
    const r = fitOut(TINY)
    expect(r.doors).toBe(1)
    expect(r.items.length).toBeGreaterThan(0)
    expect(r.items.length).toBeLessThan(8)
    expect(r.people.length).toBeGreaterThanOrEqual(1)
  })

  it('stays within a draw budget on a whole floor', () => {
    const r = fitOut(LARGE)
    expect(r.pieces.length).toBeLessThanOrEqual(MAX_PIECES)
    expect(r.items.filter((i) => i.kind === 'bench').reduce((n, i) => n + i.seats, 0)).toBeLessThanOrEqual(80)
    expect(r.people.length).toBeLessThanOrEqual(12)
  })

  it('a two-suite option is fitted out as one room', () => {
    const r = fitOut({ foot: foot(0, 4.2), sf: 10500, seed: 'odt-700+odt-710' })
    expect(r.pieces.filter((p) => p.tone === 'party')).toHaveLength(2)
    expect(seats(r)).toBeGreaterThan(seats(fitOut(MID)))
  })

  it('handles nonsense sizes without throwing', () => {
    expect(() => fitOut({ ...MID, sf: 0 })).not.toThrow()
    expect(() => fitOut({ ...MID, sf: Number.NaN })).not.toThrow()
    expect(fitOut({ ...MID, sf: -5 }).people.length).toBeGreaterThanOrEqual(1)
  })
})
