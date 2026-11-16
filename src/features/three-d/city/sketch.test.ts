import { describe, expect, it } from 'vitest'
import { PAVE, cityPlan, roadRects, type Block, type Road } from './plan'
import { FLOOR_LINE_EVERY, GROUND_Y, blockSegments, flatten, roadSegments, treeSegments } from './sketch'

const block: Block = { x: 0, z: -20, w: 6, d: 4, h: 7, far: false }

describe('blockSegments', () => {
  it('draws the 12 edges plus a floor line every few units, none hugging the roof', () => {
    const segs = blockSegments(block)
    const floors = Math.floor((block.h - 0.4) / FLOOR_LINE_EVERY)
    expect(segs).toHaveLength(12 + 4 * floors)
    for (const s of segs) {
      expect(Math.min(s[1], s[4])).toBeGreaterThanOrEqual(0)
      expect(Math.max(s[1], s[4])).toBeLessThanOrEqual(block.h)
    }
  })

  it('a block lower than one floor line gets only its edges', () => {
    expect(blockSegments({ ...block, h: 1.5 })).toHaveLength(12)
  })
})

describe('treeSegments', () => {
  it('a trunk, six spokes and a six-sided rim, all within the tree', () => {
    const t = { x: 3, z: -4, h: 1.8, r: 0.4 }
    const segs = treeSegments(t)
    expect(segs).toHaveLength(13)
    for (const s of segs) for (const [x, z] of [[s[0], s[2]], [s[3], s[5]]] as const) expect(Math.hypot(x - t.x, z - t.z)).toBeLessThanOrEqual(t.r + 1e-9)
  })
})

describe('roadSegments', () => {
  const roads: Road[] = cityPlan('odt', { halfW: 9.66, halfD: 4.76, height: 12 }).roads

  it('lies flat on the ground', () => {
    for (const s of roadSegments(roads)) {
      expect(s[1]).toBe(GROUND_Y)
      expect(s[4]).toBe(GROUND_Y)
    }
  })

  it('no kerb line or dash runs through a crossing road', () => {
    const rects = roadRects(roads)
    for (const s of roadSegments(roads)) {
      const mid = [(s[0] + s[3]) / 2, (s[2] + s[5]) / 2] as const
      const along = s[0] === s[3] ? 'z' : 'x'
      // The midpoint of a line along x may lie on its own road but never inside a road running along z, and vice versa.
      const inCross = rects.some((r) => mid[0] > r.x0 + 1e-6 && mid[0] < r.x1 - 1e-6 && mid[1] > r.z0 + 1e-6 && mid[1] < r.z1 - 1e-6
        && (along === 'x' ? r.z1 - r.z0 > r.x1 - r.x0 + PAVE : r.x1 - r.x0 > r.z1 - r.z0 + PAVE))
      expect(inCross).toBe(false)
    }
  })

  it('flattens to 6 numbers a segment', () => {
    expect(flatten(roadSegments(roads))).toHaveLength(roadSegments(roads).length * 6)
  })
})
