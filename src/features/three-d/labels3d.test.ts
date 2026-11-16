import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { buildStackModel, type SuiteVisual } from '../stack/suiteVisual'
import {
  LINE_H, MIN_FACE_H, ONE_LINE_H, TWO_LINES_H, WRAPPED_H, chooseParts, convexOverlap, fitLabel, hideCollisions, innerRect, labelContent, labelPriority, labelSize, line1Text, textWidth, turnLabel,
  uprightBox,
  type LabelContent, type Pt2,
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
  it('two lines: number and SF, then the tenant or the status in words', () => {
    expect(content('700')).toEqual({ number: '700', sf: '4,300 SF', text: 'Vacant', compact: false, notable: true })
    expect(content('600')).toMatchObject({ text: 'Flamingo Row Media · ends 04/2027', notable: true })
    expect(content('1010')).toMatchObject({ text: 'Committed · starts 03/2027', notable: true })
    expect(content('600', '2027-07-01')).toMatchObject({ text: 'Potential · was Flamingo Row Media', notable: true })
    expect(content('900')).toEqual({ number: '900', sf: '12,400 SF', text: 'Coralstone Insurance', compact: false, notable: false })
    expect(content('100')).toMatchObject({ text: 'Lobby', notable: false })
  })

  it('marks suites under 2,500 SF compact', () => {
    expect(content('720').compact).toBe(true)
    expect(content('330').compact).toBe(true)
    expect(content('220').compact).toBe(false)
  })

  it('line 1 reads "number · SF"', () => {
    expect(line1Text(content('700'))).toBe('700 · 4,300 SF')
  })
})

describe('turnLabel (floor view, narrow but deep top faces)', () => {
  const tenanted: LabelContent = { number: '320', sf: '2,800 SF', text: 'Breakwater Consulting', compact: false, notable: false }

  it('turns the label to run along the depth when that shows more of it', () => {
    expect(turnLabel(tenanted, { w: 55, h: 230 }, false)).toBe(true)
    expect(turnLabel({ ...tenanted, compact: true }, { w: 22, h: 230 }, false)).toBe(true) // the number alone fits only turned
  })

  it('keeps it across the face when the face is wide enough, or when turning gains nothing', () => {
    expect(turnLabel(content('500'), { w: 500, h: 230 }, false)).toBe(false)
    expect(turnLabel(tenanted, { w: 260, h: 230 }, false)).toBe(false)
    expect(turnLabel(tenanted, { w: 55, h: 50 }, false)).toBe(false) // shallow: no room the other way either
    expect(turnLabel({ ...tenanted, compact: true }, { w: 60, h: 230 }, false)).toBe(false)
  })
})

describe('chooseParts', () => {
  const c: LabelContent = { number: '600', sf: '12,400 SF', text: 'Flamingo Row Media · ends 04/2027', compact: false, notable: true }

  it('shows both lines on a wide, tall face', () => {
    expect(chooseParts(c, { w: 400, h: 40 }, false)).toEqual({ number: true, sf: true, tenant: true, lines: 2 })
  })

  it('drops line 2 first, then the SF, and keeps the number to the last', () => {
    expect(chooseParts(c, { w: 400, h: 20 }, false)).toEqual({ number: true, sf: true, tenant: false, lines: 1 }) // one line tall
    const at = (w: number) => chooseParts(c, { w, h: 40 }, false)
    expect(at(textWidth(line1Text(c)) + 10)).toMatchObject({ sf: true, tenant: true })
    expect(at(textWidth(line1Text(c)) + 9)).toEqual({ number: true, sf: false, tenant: false, lines: 1 }) // no line 2 without the SF
    expect(at(textWidth('600') + 10)).toMatchObject({ number: true, sf: false })
    expect(at(12)).toEqual({ number: false, sf: false, tenant: false, lines: 0 })
  })

  it('a compact suite shows its number alone, however much room there is', () => {
    expect(chooseParts({ ...c, compact: true }, { w: 400, h: 40 }, false)).toEqual({ number: true, sf: false, tenant: false, lines: 1 })
  })

  it('shows line 2 truncated when at least a useful stub of it fits', () => {
    const long = { ...c, text: 'A'.repeat(60) }
    expect(chooseParts(long, { w: 120, h: 40 }, false).tenant).toBe(true)
  })

  it('shows nothing on a face too short for a line', () => {
    expect(chooseParts(c, { w: 400, h: ONE_LINE_H - 1 }, false).lines).toBe(0)
    expect(chooseParts(c, { w: 400, h: ONE_LINE_H }, false).lines).toBe(1)
  })

  it('a forced label (matched, selected, hovered, focused) always keeps its number', () => {
    expect(chooseParts(c, { w: 10, h: 6 }, true)).toEqual({ number: true, sf: false, tenant: false, lines: 1 })
  })

  it('labelSize grows with the parts shown and never shrinks below the number', () => {
    const all = chooseParts(c, { w: 400, h: 40 }, false)
    const s = labelSize(c, all, 400)
    expect(s.h).toBe(TWO_LINES_H)
    expect(labelSize(c, { number: true, sf: true, tenant: false, lines: 1 }, 400).h).toBe(LINE_H)
    expect(s.w).toBe(textWidth(c.text) + 10)
    expect(labelSize(c, { number: false, sf: false, tenant: false, lines: 0 }, 100)).toEqual({ w: 0, h: 0 })
    expect(labelSize(c, all, 150).w).toBeLessThanOrEqual(150) // a truncated line 2 stays on its face
    const forced = chooseParts(c, { w: 10, h: 20 }, true)
    expect(labelSize(c, forced, 10).w).toBe(textWidth('600') + 10) // the number overflows
  })

  it('labelSize counts the second line a long line 2 wraps to in floor view (wrap), and only there', () => {
    const all = chooseParts(c, { w: 400, h: 60 }, false)
    const narrow = textWidth(c.text) // too narrow for line 2 on one line once padded
    expect(labelSize(c, all, narrow, true).h).toBe(WRAPPED_H)
    expect(WRAPPED_H).toBe(TWO_LINES_H + 13)
    expect(labelSize(c, all, narrow).h).toBe(TWO_LINES_H) // on the facade line 2 truncates instead
    expect(labelSize(c, all, 400, true).h).toBe(TWO_LINES_H) // fits on one line: no wrap
    expect(labelSize(c, { number: true, sf: true, tenant: false, lines: 1 }, 40, true).h).toBe(LINE_H)
  })
})

describe('innerRect (labels sit upright inside the projected face)', () => {
  it('is the face itself when the face is an upright rectangle', () => {
    expect(innerRect([{ x: 5, y: 5 }, { x: 105, y: 5 }, { x: 105, y: 35 }, { x: 5, y: 35 }])).toEqual({ x: 5, y: 5, w: 100, h: 30 })
  })

  it('stays inside a face seen in perspective: right of both left corners, below both top corners', () => {
    const r = innerRect([{ x: 10, y: 20 }, { x: 210, y: 26 }, { x: 205, y: 60 }, { x: 12, y: 52 }])
    expect(r).toEqual({ x: 12, y: 26, w: 193, h: 26 })
  })

  it('a face too slanted for any upright box gives an empty one at its centre', () => {
    const r = innerRect([{ x: 0, y: 0 }, { x: 100, y: 60 }, { x: 80, y: 90 }, { x: -20, y: 30 }])
    expect(r).toEqual({ x: 0, y: 45, w: 80, h: 0 })
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

  it('labelPriority: forced, then notable status, then plain, then dimmed', () => {
    const cue: LabelContent = { number: '1', sf: '1,000 SF', text: 'Vacant', compact: false, notable: true }
    const plain: LabelContent = { ...cue, notable: false }
    expect([labelPriority(plain, true, true), labelPriority(cue, false, false), labelPriority(plain, false, false), labelPriority(cue, false, true)])
      .toEqual([4, 3, 2, 1])
  })
})

describe('uprightBox and fitLabel (a face seen at an angle slopes on screen)', () => {
  // A long facade face 22px thick whose edges fall 20px over its 400px width.
  const sloped: [Pt2, Pt2, Pt2, Pt2] = [{ x: 0, y: 100 }, { x: 400, y: 120 }, { x: 400, y: 142 }, { x: 0, y: 122 }]
  const c: LabelContent = { number: '700', sf: '4,300 SF', text: 'Vacant', compact: false, notable: true }

  it('the inner bounds of a sloped face are too thin for a line', () => {
    expect(innerRect(sloped).h).toBe(2)
  })

  it('finds the widest box of a given height from the face\'s left side', () => {
    const box = uprightBox(sloped, 14) as { x: number; y: number; w: number; h: number }
    expect(box.x).toBe(0)
    expect(box.h).toBeGreaterThanOrEqual(14)
    expect(box.w).toBeCloseTo(160, 0) // 22px thick, 14 needed: 8px of fall = 160px
    expect(uprightBox(sloped, 23)).toBeNull()
  })

  it('takes the whole face when it is upright and tall enough', () => {
    const upright: [Pt2, Pt2, Pt2, Pt2] = [{ x: 5, y: 5 }, { x: 105, y: 5 }, { x: 105, y: 35 }, { x: 5, y: 35 }]
    expect(uprightBox(upright, 14)).toEqual({ x: 5, y: 5, w: 100, h: 30 })
  })

  it('fitLabel shows line 1 upright on the sloped face', () => {
    const fit = fitLabel(c, sloped, false)
    expect(fit.parts).toEqual({ number: true, sf: true, tenant: false, lines: 1 })
    expect(fit.box.h).toBeGreaterThanOrEqual(ONE_LINE_H)
  })

  it('fitLabel leaves a face thinner than MIN_FACE_H unlabelled unless forced', () => {
    const thin: [Pt2, Pt2, Pt2, Pt2] = [{ x: 0, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 100 + MIN_FACE_H - 1 }, { x: 0, y: 100 + MIN_FACE_H - 1 }]
    expect(fitLabel(c, thin, false).parts.lines).toBe(0)
    expect(fitLabel(c, thin, true).parts).toMatchObject({ number: true, lines: 1 })
  })

  it('fitLabel prefers two lines where the face is tall enough for them', () => {
    const tall: [Pt2, Pt2, Pt2, Pt2] = [{ x: 0, y: 100 }, { x: 400, y: 110 }, { x: 400, y: 150 }, { x: 0, y: 140 }]
    expect(fitLabel(c, tall, false).parts).toEqual({ number: true, sf: true, tenant: true, lines: 2 })
  })
})

describe('uprightBox and fitLabel are mirror-symmetric (the camera orbits either way)', () => {
  type Quad = [Pt2, Pt2, Pt2, Pt2]
  /** The face reflected about x = 0, re-ordered so it is still [top-left, top-right, bottom-right, bottom-left]. */
  const mirror = ([tl, tr, br, bl]: Quad): Quad => [{ x: -tr.x, y: tr.y }, { x: -tl.x, y: tl.y }, { x: -bl.x, y: bl.y }, { x: -br.x, y: br.y }]
  const c: LabelContent = { number: '700', sf: '4,300 SF', text: 'Vacant', compact: false, notable: true }
  // 200px wide, 12px tall on the left and 30px on the right (a face seen from its right).
  const wedge: Quad = [{ x: 0, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 130 }, { x: 0, y: 112 }]
  // A long face whose edges fall the other way, 14px tall at its left end and 20px at its right.
  const fall: Quad = [{ x: 0, y: 120 }, { x: 300, y: 100 }, { x: 300, y: 120 }, { x: 0, y: 134 }]

  it.each([['wedge', wedge], ['fall', fall]] as const)('%s: a face and its mirror image give boxes of the same size', (_, q) => {
    for (const h of [MIN_FACE_H, ONE_LINE_H, TWO_LINES_H]) {
      const a = uprightBox(q, h)
      const b = uprightBox(mirror(q), h)
      expect(a === null, `h ${h}`).toBe(b === null)
      if (!a || !b) continue
      expect(b.w, `h ${h}`).toBeCloseTo(a.w, 3)
      expect(b.h, `h ${h}`).toBeCloseTo(a.h, 3)
      expect(b.x + b.w, `h ${h}: the mirrored box mirrors the box`).toBeCloseTo(-a.x, 3)
    }
  })

  it('the wedge gets a label from its tall right side, as its mirror does from its tall left side', () => {
    const fit = fitLabel(c, wedge, false)
    const mirrored = fitLabel(c, mirror(wedge), false)
    expect(fit.parts).toEqual(mirrored.parts)
    expect(fit.parts).toMatchObject({ number: true, sf: true, lines: 1 })
    expect(fit.box.x + fit.box.w).toBeCloseTo(200, 3) // anchored at the tall (right) end; the text starts at its left
    expect(fit.box.w).toBeCloseTo(mirrored.box.w, 3)
    expect(fit.box.h).toBeGreaterThanOrEqual(ONE_LINE_H)
  })

  it('an upright face too thin at both ends gets no box', () => {
    const thin: Quad = [{ x: 0, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 109 }, { x: 0, y: 109 }]
    expect(uprightBox(thin, ONE_LINE_H)).toBeNull()
    expect(uprightBox(mirror(thin), ONE_LINE_H)).toBeNull()
  })
})
