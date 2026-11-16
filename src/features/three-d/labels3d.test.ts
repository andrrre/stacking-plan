import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { buildStackModel, type SuiteVisual } from '../stack/suiteVisual'
import {
  LINE_H, MIN_FACE_H, ONE_LINE_H, TWO_LINES_H, WRAPPED_H, chooseParts, convexOverlap, fitLabel, hideCollisions, innerRect, labelContent, labelForced, labelPriority, labelSize, line1Text, textWidth, turnLabel,
  TAG_H, fromFaceFrame, labelAngle, leftBox, thinTags, toFaceFrame,
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

  it('the previewed move\'s destination says the tenant moves in; the suite it leaves gets no cue', () => {
    const v = visuals().find((x) => x.suite.number === '900') as SuiteVisual
    expect(labelContent({ ...v, move: 'in' }).text).toBe('Coralstone Insurance · Moves in')
    expect(labelContent({ ...v, move: 'out' }).text).toBe('Coralstone Insurance')
  })
})

describe('labelForced', () => {
  const v = visuals().find((x) => x.suite.number === '900') as SuiteVisual
  it('forces a match, the selection, the hovered or focused suite, and both suites of a previewed move', () => {
    expect(labelForced(v, false, false)).toBe(false)
    expect(labelForced({ ...v, matchRank: 1 }, false, false)).toBe(true)
    expect(labelForced({ ...v, selected: true }, false, false)).toBe(true)
    expect(labelForced(v, true, false)).toBe(true)
    expect(labelForced(v, false, true)).toBe(true)
    expect(labelForced({ ...v, move: 'in' }, false, false)).toBe(true)
    expect(labelForced({ ...v, move: 'out' }, false, false)).toBe(true)
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

describe('leftBox and fitLabel (in the face\'s own frame, the label starts at the face\'s left end)', () => {
  // A long face 22px thick whose edges fall 20px over its 400px width (as if not yet turned level).
  const sloped: [Pt2, Pt2, Pt2, Pt2] = [{ x: 0, y: 100 }, { x: 400, y: 120 }, { x: 400, y: 142 }, { x: 0, y: 122 }]
  const c: LabelContent = { number: '700', sf: '4,300 SF', text: 'Vacant', compact: false, notable: true }

  it('the inner bounds of a sloped face are too thin for a line', () => {
    expect(innerRect(sloped).h).toBe(2)
  })

  it('reaches from the left end as far as the face stays thick enough', () => {
    const box = leftBox(sloped, 14) as { x: number; y: number; w: number; h: number }
    expect(box.x).toBe(0)
    expect(box.h).toBeGreaterThanOrEqual(14)
    expect(box.w).toBeCloseTo(160, 0) // 22px thick, 14 needed: 8px of fall = 160px
    expect(leftBox(sloped, 23)).toBeNull()
  })

  it('takes the whole face when it is level and tall enough', () => {
    const level: [Pt2, Pt2, Pt2, Pt2] = [{ x: 5, y: 5 }, { x: 105, y: 5 }, { x: 105, y: 35 }, { x: 5, y: 35 }]
    expect(leftBox(level, 14)).toEqual({ x: 5, y: 5, w: 100, h: 30 })
  })

  it('a face whose left end is too thin gets no box, even where its right end is thick', () => {
    const wedge: [Pt2, Pt2, Pt2, Pt2] = [{ x: 0, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 130 }, { x: 0, y: 109 }]
    expect(leftBox(wedge, ONE_LINE_H)).toBeNull()
    expect(fitLabel(c, wedge, false).parts.lines).toBe(0)
  })

  it('fitLabel leaves a face thinner than MIN_FACE_H unlabelled unless forced', () => {
    const thin: [Pt2, Pt2, Pt2, Pt2] = [{ x: 0, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 100 + MIN_FACE_H - 1 }, { x: 0, y: 100 + MIN_FACE_H - 1 }]
    expect(fitLabel(c, thin, false).parts.lines).toBe(0)
    expect(fitLabel(c, thin, true).parts).toMatchObject({ number: true, lines: 1 })
  })

  it('fitLabel prefers two lines where the face is tall enough for them', () => {
    const tall: [Pt2, Pt2, Pt2, Pt2] = [{ x: 0, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 140 }, { x: 0, y: 140 }]
    expect(fitLabel(c, tall, false).parts).toEqual({ number: true, sf: true, tenant: true, lines: 2 })
  })

  it('on a tapering face the label is centred in the thickness over its own extent, not the whole face\'s', () => {
    // 30px thick at the left end, 16px at the right: over the label's first ~90px it is ~27px thick.
    const taper: [Pt2, Pt2, Pt2, Pt2] = [{ x: 0, y: 100 }, { x: 400, y: 107 }, { x: 400, y: 123 }, { x: 0, y: 130 }]
    const fit = fitLabel(c, taper, false)
    const extent = textWidth(line1Text(c)) + 10
    expect(fit.box.x).toBe(0)
    expect(fit.box.y).toBeCloseTo(100 + (7 * extent) / 400, 6) // the top edge at the label's right end
    expect(fit.box.y + fit.box.h).toBeCloseTo(130 - (7 * extent) / 400, 6) // the bottom edge there
  })
})

describe('labels follow a sloping face by rotation (labelAngle, toFaceFrame, fromFaceFrame)', () => {
  type Quad = [Pt2, Pt2, Pt2, Pt2]
  const c: LabelContent = { number: '700', sf: '4,300 SF', text: 'Vacant', compact: false, notable: true }
  const rad = (deg: number) => (deg * Math.PI) / 180
  const toRad = rad
  /** A band `len` px long and `thick` px thick whose baseline runs at `deg` degrees (screen y down), from (x, y). */
  const band = (len: number, thick: number, deg: number, x = 100, y = 200): Quad => {
    const u = { x: Math.cos(rad(deg)), y: Math.sin(rad(deg)) }
    const n = { x: -u.y, y: u.x }
    const at = (a: number, b: number) => ({ x: x + u.x * a + n.x * b, y: y + u.y * a + n.y * b })
    return [at(0, 0), at(len, 0), at(len, thick), at(0, thick)]
  }
  const mirror = ([tl, tr, br, bl]: Quad): Quad => [{ x: -tr.x, y: tr.y }, { x: -tl.x, y: tl.y }, { x: -bl.x, y: bl.y }, { x: -br.x, y: br.y }]
  /** Whether `p` lies inside the convex quad (clockwise on screen), within `eps` px. */
  const inside = (q: Quad, p: Pt2, eps = 0.01) => q.every((a, i) => {
    const b = q[(i + 1) % 4] as Pt2
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -eps * Math.hypot(b.x - a.x, b.y - a.y)
  })
  /** Where the fitted box lands on screen: its four corners carried back from the face's frame. */
  const onScreen = (q: Quad, forced = false) => {
    const angle = labelAngle(q)
    const fit = fitLabel(c, toFaceFrame(q, angle), forced)
    const { x, y, w, h } = fit.box
    return { angle, fit, corners: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map((p) => fromFaceFrame(p, angle)) as Quad }
  }

  it('a thin band sloping 7° gets line 1, turned to the band and wholly inside it', () => {
    const q = band(400, 18, 7)
    expect(fitLabel(c, q, false).parts.sf).toBe(false) // upright, a 7° slope leaves room for the number at most
    const { angle, fit, corners } = onScreen(q)
    expect((angle * 180) / Math.PI).toBeCloseTo(7, 3)
    expect(fit.parts).toEqual({ number: true, sf: true, tenant: false, lines: 1 })
    expect(fit.box.h).toBeGreaterThanOrEqual(ONE_LINE_H)
    expect(fit.box.w).toBeGreaterThanOrEqual(textWidth(line1Text(c)) + 10)
    for (const p of corners) expect(inside(q, p), JSON.stringify(p)).toBe(true)
  })

  it('a level face gets angle 0 and its frame is the screen', () => {
    const level: Quad = [{ x: 5, y: 5 }, { x: 105, y: 5 }, { x: 105, y: 35 }, { x: 5, y: 35 }]
    const converging: Quad = [{ x: 0, y: 100 }, { x: 400, y: 110 }, { x: 400, y: 140 }, { x: 0, y: 150 }]
    expect(labelAngle(level)).toBe(0)
    expect(labelAngle(converging)).toBe(0) // edges converging in perspective about a level middle line
    expect(toFaceFrame(level, 0)).toEqual(level)
    expect(fromFaceFrame({ x: 3, y: 4 }, 0)).toEqual({ x: 3, y: 4 })
  })

  it('turns by the face\'s own slope at every angle, however small: no upright mode, so nothing snaps', () => {
    const deg = (q: Quad) => (labelAngle(q) * 180) / Math.PI
    for (const d of [0.5, 1, 2, 3, 12, -0.5, -2]) expect(deg(band(400, 30, d)), `${d}°`).toBeCloseTo(d, 6)
  })

  it('every label starts at its face\'s left end, centred in the band: a wide and a narrow suite on one floor alike', () => {
    // Two suites side by side on one band sloping 9°: 420px and 60px long.
    const wide = band(420, 30, 9, 100, 200)
    const at = fromFaceFrame({ x: 426, y: 0 }, toRad(9))
    const narrow = band(60, 30, 9, 100 + at.x, 200 + at.y)
    for (const [name, q] of [['wide', wide], ['narrow', narrow]] as const) {
      const { fit, corners } = onScreen(q)
      const mid = { x: (q[0].x + q[3].x) / 2, y: (q[0].y + q[3].y) / 2 } // the middle of the face's left end
      const start = { x: (corners[0].x + corners[3].x) / 2, y: (corners[0].y + corners[3].y) / 2 } // the box's
      expect(fit.parts.lines, name).toBeGreaterThan(0)
      expect(Math.hypot(start.x - mid.x, start.y - mid.y), name).toBeLessThan(0.01)
    }
  })

  it('mirrored faces give mirrored angles, with the label at the left end in both', () => {
    for (const d of [3, 9, 20]) {
      const q = band(300, 20, d)
      const m = mirror(q)
      expect(labelAngle(m), `${d}°`).toBeCloseTo(-labelAngle(q), 9)
      for (const face of [q, m]) {
        const { corners } = onScreen(face)
        expect(Math.hypot(corners[0].x - face[0].x, corners[0].y - face[0].y), `${d}°`).toBeLessThan(0.01)
      }
    }
  })

  it('mirrored slopes give mirrored angles and the same parts', () => {
    for (const deg of [3, 7, 15, 25]) {
      const q = band(300, 20, deg)
      expect(labelAngle(mirror(q)), `${deg}°`).toBeCloseTo(-labelAngle(q), 9)
      expect(onScreen(mirror(q)).fit.parts, `${deg}°`).toEqual(onScreen(q).fit.parts)
    }
  })

  it('never turns text past a quarter: a face seen mirrored (its edges run right to left) keeps angle 0', () => {
    const q = band(300, 20, 7)
    const reversed: Quad = [q[1], q[0], q[3], q[2]]
    expect(labelAngle(reversed)).toBe(0)
    expect(Math.abs(labelAngle(band(300, 20, 60)))).toBeLessThan(Math.PI / 2)
  })

  it('a band thinner than a line carries no label, unless forced', () => {
    const q = band(400, MIN_FACE_H - 1, 7)
    expect(onScreen(q).fit.parts.lines).toBe(0)
    expect(onScreen(q, true).fit.parts).toMatchObject({ number: true, lines: 1 })
  })

  it('a band tall enough for two lines shows both, turned', () => {
    const { fit, corners } = onScreen(band(400, 30, -12))
    const q = band(400, 30, -12)
    expect(fit.parts).toEqual({ number: true, sf: true, tenant: true, lines: 2 })
    for (const p of corners) expect(inside(q, p)).toBe(true)
  })

  it('collisions compare the turned labels\' real outlines, not their bounding boxes', () => {
    const a = band(200, 14, 20, 0, 0)
    const below = band(200, 14, 20, 0, 16) // the next floor down: bounding boxes overlap, outlines do not
    const across = band(200, 14, -20, 60, 60) // crosses `a`
    expect(hideCollisions([{ id: 'a', quad: a, priority: 2 }, { id: 'b', quad: below, priority: 2 }]).size).toBe(0)
    expect([...hideCollisions([{ id: 'a', quad: a, priority: 3 }, { id: 'x', quad: across, priority: 2 }])]).toEqual(['x'])
  })
})

describe('thinTags (floor numbers that would overlap give way)', () => {
  const column = (gap: number, n = 12) => Array.from({ length: n }, (_, i) => ({ floor: n - i, x: 300, y: 100 + i * gap }))

  it('keeps every floor number when they stand a tag apart', () => {
    expect(thinTags(column(TAG_H)).size).toBe(0)
  })

  it('where floors crowd, keeps the lowest and every floor number that clears the last one kept', () => {
    const hidden = thinTags(column(TAG_H / 2 + 1))
    expect([...hidden].sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10, 12])
  })

  it('floor numbers side by side do not clash', () => {
    expect(thinTags([{ floor: 2, x: 340, y: 100 }, { floor: 1, x: 300, y: 104 }]).size).toBe(0)
    expect(thinTags([{ floor: 2, x: 310, y: 100 }, { floor: 1, x: 300, y: 104 }])).toEqual(new Set([2]))
  })

  it('nothing to thin', () => {
    expect(thinTags([]).size).toBe(0)
  })
})
