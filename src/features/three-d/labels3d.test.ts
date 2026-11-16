import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { buildStackModel, type SuiteVisual } from '../stack/suiteVisual'
import {
  LINE_H, chooseParts, convexOverlap, cueWidth, hideCollisions, labelContent, labelPriority, labelSize, mapPoint, rectToQuad,
  textWidth, toMatrix3d, turnLabel, turnQuad, type LabelContent, type Pt2,
} from './labels3d'

const TODAY = '2026-11-15'
const ODT = BUNDLED_BUILDINGS[0]

function visuals(asOf = TODAY): SuiteVisual[] {
  return buildStackModel({
    building: ODT, asOf, today: TODAY, mode: 'availability', matches: [], highlightIds: null, modifiedIds: new Set(), selectedSuiteId: null,
  }).floors.flatMap((f) => f.suites)
}
const content = (n: string, asOf = TODAY) => labelContent(visuals(asOf).find((v) => v.suite.number === n) as SuiteVisual)

describe('labelContent', () => {
  it('leads with the status cue: VACANT, the expiring clock date, the committed lock date, Potential', () => {
    expect(content('500')).toEqual({ cue: { kind: 'word', text: 'VACANT' }, number: '500', tenant: null, sf: '10,250 SF' })
    expect(content('600')).toMatchObject({ cue: { kind: 'clock', text: '04/2027' }, number: '600', tenant: 'Flamingo Row Media' })
    expect(content('1010')).toMatchObject({ cue: { kind: 'lock', text: '03/2027' }, tenant: null })
    expect(content('600', '2027-07-01')).toMatchObject({ cue: { kind: 'word', text: 'Potential' }, tenant: 'Flamingo Row Media lease ends 04/2027' })
  })

  it('has no cue for occupied or common space, just number, tenant (or area name) and SF', () => {
    expect(content('900')).toEqual({ cue: null, number: '900', tenant: 'Coralstone Insurance', sf: '12,400 SF' })
    expect(content('100')).toMatchObject({ cue: null, tenant: 'Lobby' })
  })

  it('every vacant and expiring suite of the hero carries its cue', () => {
    const vs = visuals()
    const cue = (n: string) => labelContent(vs.find((v) => v.suite.number === n) as SuiteVisual).cue
    for (const n of ['300', '310', '410', '500', '700', '710']) expect(cue(n)?.text, n).toBe('VACANT')
    for (const n of ['600', '400', '220', '1000']) expect(cue(n)?.kind, n).toBe('clock')
  })
})

describe('turnLabel (floor view, narrow but deep top faces)', () => {
  const tenanted: LabelContent = { cue: null, number: '320', tenant: 'Breakwater Consulting', sf: '2,800 SF' }

  it('turns the label to run along the depth when that shows more of it', () => {
    expect(turnLabel(tenanted, { w: 55, h: 230 }, false)).toBe(true)
    expect(turnLabel(content('330'), { w: 40, h: 230 }, false)).toBe(true)
  })

  it('keeps it across the face when the face is wide enough, or when turning gains nothing', () => {
    expect(turnLabel(content('500'), { w: 500, h: 230 }, false)).toBe(false)
    expect(turnLabel(tenanted, { w: 260, h: 230 }, false)).toBe(false)
    expect(turnLabel(tenanted, { w: 55, h: 50 }, false)).toBe(false) // shallow: no room the other way either
  })

  it('reads the turned face from its front-left corner towards the back', () => {
    const tl = { x: 0, y: 0 }, tr = { x: 10, y: 0 }, br = { x: 10, y: 50 }, bl = { x: 0, y: 50 }
    expect(turnQuad([tl, tr, br, bl])).toEqual([bl, tl, tr, br])
  })
})

describe('chooseParts', () => {
  const c: LabelContent = { cue: { kind: 'clock', text: '04/2027' }, number: '600', tenant: 'Flamingo Row Media', sf: '12,400 SF' }

  it('shows everything on a wide, tall face, the tenant on its own line', () => {
    expect(chooseParts(c, { w: 400, h: 40 }, false)).toEqual({ cue: true, number: true, tenant: true, sf: true, lines: 2 })
  })

  it('drops parts from the end of the priority list as the face narrows: SF, then tenant, then number, then cue', () => {
    const at = (w: number) => chooseParts(c, { w, h: 20 }, false)
    expect(at(400)).toEqual({ cue: true, number: true, tenant: true, sf: true, lines: 1 })
    expect(at(170)).toMatchObject({ cue: true, number: true, tenant: true, sf: false })
    expect(at(100)).toMatchObject({ cue: true, number: true, tenant: false, sf: false })
    expect(at(70)).toMatchObject({ cue: true, number: false, tenant: false })
    expect(at(12)).toEqual({ cue: false, number: false, tenant: false, sf: false, lines: 0 })
  })

  it('a label without a cue shows its number first, or nothing', () => {
    const plain: LabelContent = { cue: null, number: '330', tenant: 'Palmhaven', sf: '800 SF' }
    expect(chooseParts(plain, { w: 34, h: 20 }, false)).toMatchObject({ number: true, tenant: false })
    expect(chooseParts(plain, { w: 20, h: 20 }, false).lines).toBe(0)
  })

  it('shows nothing on a face too short for a line', () => {
    expect(chooseParts(c, { w: 400, h: LINE_H - 3 }, false).lines).toBe(0)
  })

  it('a forced label (matched, selected, hovered, focused) always keeps cue and number', () => {
    expect(chooseParts(c, { w: 10, h: 6 }, true)).toEqual({ cue: true, number: true, tenant: false, sf: false, lines: 1 })
  })

  it('labelSize grows with the parts shown and never shrinks below the visible head', () => {
    const all = chooseParts(c, { w: 400, h: 40 }, false)
    const s = labelSize(c, all, 400)
    expect(s.h).toBe(2 * LINE_H + 2)
    expect(s.w).toBeGreaterThan(cueWidth(c.cue) + textWidth('600'))
    expect(labelSize(c, { cue: false, number: false, tenant: false, sf: false, lines: 0 }, 100)).toEqual({ w: 0, h: 0 })
    const oneLine = chooseParts(c, { w: 170, h: 20 }, false)
    expect(labelSize(c, oneLine, 170).w).toBeLessThanOrEqual(170) // a truncated tenant stays on its face
    const forced = chooseParts(c, { w: 10, h: 20 }, true)
    expect(labelSize(c, forced, 10).w).toBeGreaterThan(cueWidth(c.cue) + textWidth('600')) // cue and number overflow
  })
})

describe('collisions', () => {
  const sq = (x: number, y: number, s = 10): Pt2[] => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }]

  it('convexOverlap uses the real shapes, so sloped labels on different floors do not clash', () => {
    expect(convexOverlap(sq(0, 0), sq(5, 5))).toBe(true)
    expect(convexOverlap(sq(0, 0), sq(10, 0))).toBe(false) // touching
    const slopeA: Pt2[] = [{ x: 0, y: 0 }, { x: 200, y: 30 }, { x: 200, y: 44 }, { x: 0, y: 14 }]
    const slopeB: Pt2[] = [{ x: 0, y: 30 }, { x: 200, y: 60 }, { x: 200, y: 74 }, { x: 0, y: 44 }]
    expect(convexOverlap(slopeA, slopeB)).toBe(false) // their bounding boxes overlap
  })

  it('hideCollisions keeps higher priority labels and hides the ones they overlap', () => {
    const hidden = hideCollisions([
      { id: 'a', quad: sq(0, 0), priority: 2 },
      { id: 'b', quad: sq(5, 0), priority: 3 },
      { id: 'c', quad: sq(30, 0), priority: 1 },
      { id: 'd', quad: [], priority: 4 },
    ])
    expect([...hidden].sort()).toEqual(['a', 'd'])
  })

  it('labelPriority: forced, then status cue, then plain, then ghost', () => {
    const cue: LabelContent = { cue: { kind: 'word', text: 'VACANT' }, number: '1', tenant: null, sf: '' }
    const plain: LabelContent = { ...cue, cue: null }
    expect([labelPriority(plain, true, true), labelPriority(cue, false, false), labelPriority(plain, false, false), labelPriority(cue, false, true)])
      .toEqual([4, 3, 2, 1])
  })
})

describe('rectToQuad', () => {
  it('maps the box corners onto the quad, perspective included', () => {
    const q: [Pt2, Pt2, Pt2, Pt2] = [{ x: 10, y: 20 }, { x: 210, y: 40 }, { x: 205, y: 80 }, { x: 12, y: 52 }]
    const m = rectToQuad(q, 100, 30)
    const close = (p: Pt2, e: Pt2) => {
      expect(p.x).toBeCloseTo(e.x, 6)
      expect(p.y).toBeCloseTo(e.y, 6)
    }
    close(mapPoint(m, 0, 0), q[0])
    close(mapPoint(m, 100, 0), q[1])
    close(mapPoint(m, 100, 30), q[2])
    close(mapPoint(m, 0, 30), q[3])
    expect(toMatrix3d(m)).toMatch(/^matrix3d\((-?[\d.e-]+,){15}-?[\d.e-]+\)$/)
  })

  it('is a plain scale-and-translate for an axis-aligned rectangle', () => {
    const m = rectToQuad([{ x: 5, y: 5 }, { x: 105, y: 5 }, { x: 105, y: 25 }, { x: 5, y: 25 }], 50, 10)
    expect(toMatrix3d(m)).toBe('matrix3d(2,0,0,0,0,2,0,0,0,0,1,0,5,5,0,1)')
  })
})
