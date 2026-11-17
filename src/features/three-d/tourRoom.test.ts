import { describe, it, expect } from 'vitest'
import { SUITE_H } from './layout3d'
import { COLUMN_BAY, roomParts } from './tourRoom'

const foot = { x0: -3, x1: 3, z0: -4.1, z1: 4.1, floor: 7.38 }

describe('roomParts', () => {
  const r = roomParts(foot)

  it('a floor over the footprint, just above the slab, and a ceiling at the suite\'s height', () => {
    expect(r.floor).toMatchObject({ x: 0, z: 0, w: 6, d: 8.2 })
    expect(r.floor.y).toBeGreaterThan(foot.floor)
    expect(r.floor.y).toBeLessThan(foot.floor + 0.02)
    expect(r.ceiling.y).toBeCloseTo(foot.floor + SUITE_H, 6)
  })

  it('columns along both facades, at both ends and at most a bay apart, floor to ceiling', () => {
    for (const z of [foot.z0, foot.z1]) {
      const xs = r.columns.filter((c) => c.z === z).map((c) => c.x).sort((a, b) => a - b)
      expect(xs[0]).toBeCloseTo(foot.x0 + r.columns[0]!.w / 2, 6)
      expect(xs[xs.length - 1]).toBeCloseTo(foot.x1 - r.columns[0]!.w / 2, 6)
      xs.slice(1).forEach((x, i) => expect(x - xs[i]!).toBeLessThanOrEqual(COLUMN_BAY + 1e-9))
    }
    for (const c of r.columns) expect(c.h).toBeCloseTo(SUITE_H, 6)
  })

  it('a narrow suite still gets a column at each end', () => {
    const narrow = roomParts({ ...foot, x0: 0, x1: 0.4 })
    expect(narrow.columns.filter((c) => c.z === foot.z1)).toHaveLength(2)
  })

  it('a header beam across each facade at ceiling height', () => {
    expect(r.beams).toHaveLength(2)
    for (const b of r.beams) {
      expect(b.w).toBeCloseTo(6, 6)
      expect(b.y + b.h / 2).toBeCloseTo(foot.floor + SUITE_H, 6)
    }
  })

  it('carries nothing in the suite\'s status colour: only the neutral floor, ceiling, columns and beams', () => {
    expect(Object.keys(r).sort()).toEqual(['beams', 'ceiling', 'columns', 'floor'])
  })
})
