import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { findFits } from '../../domain/findFits'
import { buildStackModel, type StackModel } from '../stack/suiteVisual'
import { SEPARATED_VIEW } from './camera'
import {
  CAP_T, DEPTH, LIFT, PITCH, PLATE_W, PLINTH_H, SLAB_MARGIN, SLAB_T, SPREAD_PITCH, SUITE_GAP, SUITE_H, TOP_LABEL_DEPTH, boundsKey,
  MIN_TOP_STRIP, buildingLayout, floorLayout, labelDepth, labelFace, suiteRect, suiteWidths, topStrip, visibleTopDepth, type SuiteBox,
} from './layout3d'

const TODAY = '2026-11-15'
const [ODT, PBP] = BUNDLED_BUILDINGS
if (!PBP) throw new Error('the second bundled building is missing')

function model(minSf: number | null = null, building = ODT): StackModel {
  const matches = minSf === null ? [] : findFits(building, { minSf, includePotential: true }, TODAY, TODAY)
  return buildStackModel({
    building, asOf: TODAY, today: TODAY, mode: 'availability', matches, highlightIds: null, modifiedIds: new Set(), selectedSuiteId: null,
  })
}

const byId = (boxes: readonly SuiteBox[], id: string) => {
  const b = boxes.find((x) => x.id === id)
  if (!b) throw new Error(id)
  return b
}

describe('suiteWidths', () => {
  it('splits the plate in proportion to area after taking out the gaps', () => {
    const w = suiteWidths([1000, 3000], 10.08, 0.08)
    expect(w[0]).toBeCloseTo(2.5)
    expect(w[1]).toBeCloseTo(7.5)
  })

  it('handles an empty floor, zero areas and a plate too narrow for its gaps', () => {
    expect(suiteWidths([], 10)).toEqual([])
    expect(suiteWidths([0, 0], 10, 0)).toEqual([5, 5])
    expect(suiteWidths([5, 5], 0.05, 0.08)).toEqual([0, 0])
  })
})

describe('buildingLayout (hero building)', () => {
  const layout = buildingLayout(model())

  it('stacks the floors highest on top, one pitch apart, with floor 1 on the plinth', () => {
    const ys = layout.slabs.map((s) => [s.floor, s.y])
    expect(ys.map(([f]) => f)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
    const floor1 = layout.slabs.find((s) => s.floor === 1)
    expect(floor1?.y).toBeCloseTo(PLINTH_H + SLAB_T / 2)
    const floor12 = layout.slabs.find((s) => s.floor === 12)
    expect(floor12?.y).toBeCloseTo(PLINTH_H + 11 * PITCH + SLAB_T / 2)
  })

  it('draws each plate in proportion to its area against the largest plate, centred', () => {
    const plates = new Map(ODT.floors.map((f) => [f.number, f.suites.reduce((s, x) => s + x.areaSf, 0)]))
    const max = Math.max(...plates.values())
    for (const slab of layout.slabs) {
      expect(slab.w - 2 * SLAB_MARGIN, `floor ${slab.floor}`).toBeCloseTo((PLATE_W * (plates.get(slab.floor) ?? 0)) / max)
      expect(slab.x).toBe(0)
      expect(slab.d).toBeCloseTo(DEPTH + 2 * SLAB_MARGIN)
    }
    expect(layout.slabs.find((s) => s.floor === 12)?.w).toBeLessThan(layout.slabs.find((s) => s.floor === 9)?.w ?? 0)
  })

  it('lays suites left to right in stored order, widths proportional to area, a fixed gap apart', () => {
    for (const f of ODT.floors) {
      const boxes = f.suites.map((s) => byId(layout.suites, s.id))
      const perSf = boxes.map((b, i) => b.w / (f.suites[i]?.areaSf ?? 1))
      for (const r of perSf) expect(r).toBeCloseTo(perSf[0] ?? 0, 9)
      for (let i = 1; i < boxes.length; i++) {
        const prev = boxes[i - 1] as SuiteBox
        const cur = boxes[i] as SuiteBox
        expect(cur.x - cur.w / 2 - (prev.x + prev.w / 2), `${f.number} gap ${i}`).toBeCloseTo(SUITE_GAP)
      }
    }
  })

  it('sits every suite on its slab, full depth, the same height, flush with the facade', () => {
    for (const b of layout.suites) {
      const slab = layout.slabs.find((s) => s.floor === b.floor)
      expect(b.y - b.h / 2).toBeCloseTo((slab?.y ?? 0) + SLAB_T / 2)
      expect(b.h).toBe(SUITE_H)
      expect(b.d).toBe(DEPTH)
      expect(b.z).toBe(0)
      expect(b.lifted).toBe(false)
    }
    expect(layout.runs).toEqual([])
  })

  it('leaves a clear gap between a floor and the slab above, so every front face shows', () => {
    expect(PITCH - SLAB_T - SUITE_H).toBeGreaterThan(0.05)
  })

  it('keys the bounds so only an outline change refits the camera', () => {
    expect(boundsKey(buildingLayout(model(10_000)).bounds)).toBe(boundsKey(layout.bounds))
    expect(boundsKey(buildingLayout(model(), 1).bounds)).not.toBe(boundsKey(layout.bounds))
    expect(layout.bounds.max[1]).toBeCloseTo(PLINTH_H + 11 * PITCH + SLAB_T + SUITE_H + CAP_T + 0.01)
  })

  it('is a volume: plates about half as deep as the widest plate is wide', () => {
    expect(DEPTH / PLATE_W).toBeGreaterThan(0.44)
    expect(DEPTH / PLATE_W).toBeLessThan(0.56)
  })

  it('stands on a neutral plinth wider than every plate, and caps the roofs open to the sky', () => {
    expect(layout.plinth.y).toBeCloseTo(PLINTH_H / 2)
    expect(layout.plinth.w).toBeGreaterThan(Math.max(...layout.slabs.map((s) => s.w)))
    // Floor 12 is the roof; floor 11 is wider than 12, so its roof shows as a terrace. Below, plates are no wider than above.
    expect(layout.caps.map((c) => c.floor)).toEqual([12, 11])
    const cap = layout.caps[0]
    const top12 = byId(layout.suites, 'odt-1200')
    expect(cap && cap.y - cap.h / 2).toBeGreaterThan(top12.y + top12.h / 2)
    expect(layout.onTop).toBe(false)
  })
})

describe('buildingLayout with a search', () => {
  const layout = buildingLayout(model(10_000))

  it('lifts the matched suites out of the facade and leaves the rest', () => {
    for (const id of ['odt-500', 'odt-700', 'odt-710']) {
      expect(byId(layout.suites, id).lifted).toBe(true)
      expect(byId(layout.suites, id).z).toBeCloseTo(LIFT)
    }
    expect(byId(layout.suites, 'odt-600').lifted).toBe(false)
  })

  it('outlines each match once: 500 alone, 700 + 710 as one run, at the lifted front plane', () => {
    const runs = layout.runs.map((r) => ({ floor: r.floor, rank: r.rank }))
    expect(runs).toEqual([{ floor: 7, rank: 2 }, { floor: 5, rank: 1 }])
    const run = layout.runs.find((r) => r.rank === 2)
    const a = byId(layout.suites, 'odt-700')
    const b = byId(layout.suites, 'odt-710')
    expect(run?.x0).toBeCloseTo(a.x - a.w / 2)
    expect(run?.x1).toBeCloseTo(b.x + b.w / 2)
    expect(run?.z).toBeCloseTo(DEPTH / 2 + LIFT)
  })
})

describe('buildingLayout, other shapes', () => {
  it('separating the floors spreads them to the wider pitch', () => {
    const apart = buildingLayout(model(), 1)
    expect(apart.slabs.find((s) => s.floor === 2)?.y).toBeCloseTo(PLINTH_H + SPREAD_PITCH + SLAB_T / 2)
  })

  it('separated floors drop the caps and put labels on the front strip of each top face', () => {
    const apart = buildingLayout(model(), 1)
    expect(apart.caps).toEqual([])
    expect(apart.onTop).toBe(true)
    expect(buildingLayout(model(), 0.4).onTop).toBe(false)
    const b = byId(apart.suites, 'odt-500')
    const r = suiteRect(b)
    const top = labelFace(r, true)
    for (const c of top) expect(c[1]).toBeCloseTo(b.y + b.h / 2)
    expect(top[2][2] - top[1][2]).toBeCloseTo(TOP_LABEL_DEPTH)
    const front = labelFace(r, false, 0.1)
    for (const c of front) expect(c[2]).toBeCloseTo(b.z + b.d / 2)
    expect(front[0]).toEqual([r.x0 - 0.1, r.y1 + 0.1, r.z])
  })

  it('the visible strip of a top face, from the separated viewpoint, holds the label depth', () => {
    const gap = SPREAD_PITCH - SLAB_T - SUITE_H
    expect(gap / Math.tan((SEPARATED_VIEW.elevation * Math.PI) / 180)).toBeGreaterThan(TOP_LABEL_DEPTH)
  })

  it('draws the second building with its podium wider than its tower', () => {
    const l = buildingLayout(model(null, PBP))
    const w = (n: number) => l.slabs.find((s) => s.floor === n)?.w ?? 0
    expect(w(1)).toBeGreaterThan(w(7))
    expect(l.caps.map((c) => c.floor)).toContain(3) // the podium roof is a terrace
    expect(l.suites).toHaveLength(PBP.floors.reduce((s, f) => s + f.suites.length, 0))
  })

  it('handles a building with one floor', () => {
    const one = { ...ODT, floors: ODT.floors.filter((f) => f.number === 6) }
    const l = buildingLayout(model(null, one))
    expect(l.slabs).toHaveLength(1)
    expect(l.slabs[0]?.w).toBeCloseTo(PLATE_W + 2 * SLAB_MARGIN)
    expect(l.bounds.min[1]).toBe(0)
  })
})

describe('visible top strip (floors separated)', () => {
  const apart = buildingLayout(model(), 1)
  const b500 = byId(apart.suites, 'odt-500')
  const b1200 = byId(apart.suites, 'odt-1200')
  const at = (elevation: number, dist = 120): [number, number, number] => {
    const e = (elevation * Math.PI) / 180
    return [0, b500.y + Math.sin(e) * dist, Math.cos(e) * dist]
  }

  it('the floor above covers the back of a top face; the top floor has none above it', () => {
    expect(b500.cover).not.toBeNull()
    expect(b1200.cover).toBeNull()
    expect(visibleTopDepth(b1200, at(32))).toBe(b1200.d)
  })

  it('from the separated viewpoint the label strip fits in what shows', () => {
    expect(topStrip(b500, at(SEPARATED_VIEW.elevation))).toBeCloseTo(TOP_LABEL_DEPTH)
  })

  it('looking down more steeply hides more of it, until the label is dropped', () => {
    const d30 = visibleTopDepth(b500, at(30))
    const d50 = visibleTopDepth(b500, at(50))
    const d62 = visibleTopDepth(b500, at(62))
    expect(d50).toBeLessThan(d30)
    expect(d62).toBeLessThan(d50)
    expect(topStrip(b500, at(62))).toBe(0)
    expect(MIN_TOP_STRIP).toBeGreaterThan(0)
  })

  it('an eye at or below the top face sees none of it', () => {
    expect(visibleTopDepth(b500, [0, b500.y, 100])).toBe(0)
  })
})

describe('floorLayout (floor view)', () => {
  const eye: [number, number, number] = [2, 60, 40]

  it('draws the chosen floor and the floors below it; nothing above', () => {
    const l = floorLayout(model(), 7)
    expect(new Set(l.suites.map((b) => b.floor))).toEqual(new Set([7, 6, 5, 4, 3, 2, 1]))
    expect(l.slabs.map((s) => s.floor)).toEqual([7, 6, 5, 4, 3, 2, 1])
    expect(l.tags.map((t) => t.floor)).toEqual([7, 6, 5, 4, 3, 2, 1])
    expect(l.caps.every((c) => c.floor < 7)).toBe(true)
    expect(l.focus?.floor).toBe(7)
    expect(l.onTop).toBe(true)
  })

  it('stacks the floors together, at the same places as the whole building', () => {
    const whole = buildingLayout(model(), 0)
    const l = floorLayout(model(), 5)
    expect(byId(l.suites, 'odt-500').y).toBe(byId(whole.suites, 'odt-500').y)
    expect(byId(l.suites, 'odt-100').x).toBe(byId(whole.suites, 'odt-100').x)
  })

  it('leaves nothing over the chosen floor, so its whole top face is in view', () => {
    const l = floorLayout(model(), 5)
    const b = byId(l.suites, 'odt-500')
    expect(b.cover).toBeNull()
    expect(visibleTopDepth(b, eye)).toBe(DEPTH)
    expect(labelDepth(l, b, eye)).toBeGreaterThan(DEPTH - 0.5)
    expect(labelDepth(l, b, eye)).toBeLessThan(DEPTH)
  })

  it('labels only the chosen floor', () => {
    const l = floorLayout(model(), 5)
    expect(labelDepth(l, byId(l.suites, 'odt-400'), eye)).toBe(0)
  })

  it('the top floor loses its roof cap so its top face shows', () => {
    const l = floorLayout(model(), 12)
    expect(l.caps.some((c) => c.floor === 12)).toBe(false)
    expect(byId(l.suites, 'odt-1200').cover).toBeNull()
  })

  it('rings matches on the chosen floor without lifting them out of the plate', () => {
    const l = floorLayout(model(10000), 7)
    expect(l.suites.every((b) => b.z === 0)).toBe(true)
    expect(l.runs.map((r) => [r.floor, r.rank])).toEqual([[7, 2]])
    expect(l.runs[0]?.z).toBeCloseTo(DEPTH / 2)
    expect(floorLayout(model(10000), 6).runs).toEqual([])
  })

  it('frames the chosen plate: its bounds hold the plate and its suites, and nothing else', () => {
    const l = floorLayout(model(), 5)
    const slab = l.slabs.find((s) => s.floor === 5)
    const b = byId(l.suites, 'odt-500')
    if (!slab || !l.focus) throw new Error('no plate')
    expect(l.focus.bounds.min[1]).toBeCloseTo(slab.y - slab.h / 2)
    expect(l.focus.bounds.max[1]).toBeCloseTo(b.y + b.h / 2)
    expect(l.focus.bounds.max[0]).toBeCloseTo(slab.w / 2)
    expect(l.focus.bounds.max[2]).toBeCloseTo(slab.d / 2)
    expect(l.bounds).toEqual(buildingLayout(model(), 0).bounds) // the ground shadow stays under the whole building
  })

  it('a floor the building does not have gives the whole building', () => {
    const l = floorLayout(model(), 40)
    expect(l.focus).toBeNull()
    expect(l.suites).toHaveLength(32)
  })

  it('the whole-building layouts have no focus floor', () => {
    expect(buildingLayout(model(), 0).focus).toBeNull()
    expect(buildingLayout(model(), 1).focus).toBeNull()
    const sep = buildingLayout(model(), 1)
    expect(labelDepth(sep, byId(sep.suites, 'odt-500'), eye)).toBe(topStrip(byId(sep.suites, 'odt-500'), eye))
    expect(labelDepth(buildingLayout(model(), 0), byId(sep.suites, 'odt-500'), eye)).toBeUndefined()
  })
})
