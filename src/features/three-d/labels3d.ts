import type { SuiteVisual } from '../stack/suiteVisual'

// What a suite's facade label says, which parts fit on its face at the current zoom, where it sits (upright,
// inside the projected face) and which labels give way when they would overlap. Pure: the scene feeds it
// projected face corners in CSS pixels.

/**
 * The model's two-line label: "number · SF" over the tenant or status in words (the label's non-colour status
 * cue). A compact (small) suite shows its number alone. `notable` labels (vacant, potential, committed,
 * expiring) win collisions over plain occupied and common space.
 */
export type LabelContent = { number: string; sf: string; text: string; compact: boolean; notable: boolean }

/** The cue after line 2 on the previewed move's destination (the 2D cell's tag says the same). */
const MOVES_IN = 'Moves in'

export function labelContent(v: SuiteVisual): LabelContent {
  const { number, sf, line2, compact } = v.label
  const notable = v.status.status === 'vacant' || v.status.status === 'expiring'
  return { number, sf, text: v.move === 'in' ? `${line2} · ${MOVES_IN}` : line2, compact, notable }
}

/** A label that always keeps its number and wins collisions: a match, the selection, hovered, focused, or in a previewed move. */
export const labelForced = (v: SuiteVisual, hovered: boolean, focused: boolean): boolean =>
  v.matchRank !== null || v.selected || v.move !== null || hovered || focused

/** Which parts show: the number, the SF after it on line 1, the line-2 text ('tenant'); lines used. */
export type Parts = { number: boolean; sf: boolean; tenant: boolean; lines: 0 | 1 | 2 }
export type Size = { w: number; h: number }

export const LINE_H = 14
/**
 * Two lines: line 1's 12px line box (digits and capitals) over line 2's 13px, which still holds 12px Inter's
 * ascenders and descenders (the overlay CSS sets the same).
 */
export const TWO_LINES_H = 25
/** Two lines with line 2 wrapped onto a second line of 13px (floor view only: three-d.module.css). */
export const WRAPPED_H = TWO_LINES_H + 13
/**
 * The least height a single line's box needs. Line 1 is digits and capitals, ~8px tall in the middle of its
 * 14px line box, so the box may lose 2px a side to a sloping face without clipping a glyph.
 */
export const ONE_LINE_H = LINE_H - 4
/** A face thinner than this where its label would start carries none (unless forced): it would read as noise. */
export const MIN_FACE_H = LINE_H - 1
const PAD_X = 5
const CHAR = 6 // average advance at 11–12px Inter (tabular digits measure ~5.8)
const MIN_TENANT = 44 // below this a truncated line 2 is noise

/** Estimated text width in CSS px (the overlay uses Inter at 11–12px). */
export const textWidth = (s: string) => Math.ceil(s.length * CHAR)

/** Line 1 in full: "700 · 4,300 SF". */
export const line1Text = (c: LabelContent) => `${c.number} · ${c.sf}`

const NONE: Parts = { number: false, sf: false, tenant: false, lines: 0 }

/**
 * Which parts fit on a face of `box` px. Parts go in the handoff's order: line 2 first, then the SF, and the
 * number last; line 2 needs a face tall enough for two lines and never shows without the SF. A compact suite
 * keeps its number alone. A forced label (matched, selected, hovered, focused) always keeps its number, even
 * when it overflows the face.
 */
export function chooseParts(c: LabelContent, box: Size, forced: boolean): Parts {
  const room = box.h >= TWO_LINES_H ? 2 : box.h >= ONE_LINE_H || forced ? 1 : 0
  const width = box.w - 2 * PAD_X
  if (room === 0 || (!forced && textWidth(c.number) > width)) return NONE
  const sf = !c.compact && textWidth(line1Text(c)) <= width
  const tenant = room === 2 && sf && Math.min(textWidth(c.text), MIN_TENANT) <= width
  return { number: true, sf, tenant, lines: tenant ? 2 : 1 }
}

/** How much of a label shows with `p`: one per part, and a half more when the whole line 2 fits. */
function shown(c: LabelContent, p: Parts, w: number): number {
  const parts = [p.number, p.sf, p.tenant].filter(Boolean).length
  return parts + (p.tenant && textWidth(c.text) <= w - 2 * PAD_X ? 0.5 : 0)
}

/**
 * Floor view: whether a label should run along the depth of its top face (turned a quarter) rather than
 * across it. Only when the face is deeper than it is wide on screen and turned the label shows more.
 */
export function turnLabel(c: LabelContent, face: Size, forced: boolean): boolean {
  if (face.h <= face.w) return false
  const turned = { w: face.h, h: face.w }
  return shown(c, chooseParts(c, turned, forced), turned.w) > shown(c, chooseParts(c, face, forced), face.w)
}

/**
 * Estimated size of a label showing `parts`, in px. It is clipped to the face, except that a forced label's
 * number may overflow it (it is never truncated). With `wrap` (floor view), a line 2 too long for the face wraps
 * to a second line instead of truncating, so it is a line taller.
 */
export function labelSize(c: LabelContent, parts: Parts, faceW: number, wrap = false): Size {
  if (parts.lines === 0) return { w: 0, h: 0 }
  const head = textWidth(c.number)
  const line1 = parts.sf ? textWidth(line1Text(c)) : head
  const full = Math.max(line1, parts.tenant ? textWidth(c.text) : 0)
  const room = Math.max(faceW - 2 * PAD_X, head)
  const wraps = wrap && parts.tenant && textWidth(c.text) > room
  return { w: Math.min(full, room) + 2 * PAD_X, h: parts.lines === 1 ? LINE_H : wraps ? WRAPPED_H : TWO_LINES_H }
}

export type Rect = { x: number; y: number; w: number; h: number }
/** A label's outline on screen as a convex polygon (an upright rectangle's four corners). */
export type Placed = { id: string; quad: readonly Pt2[]; priority: number }

/** Separating-axis test for two convex polygons; touching edges do not count as overlap. */
export function convexOverlap(a: readonly Pt2[], b: readonly Pt2[]): boolean {
  if (a.length < 3 || b.length < 3) return false
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i] as Pt2
      const q = poly[(i + 1) % poly.length] as Pt2
      const axis = { x: q.y - p.y, y: p.x - q.x }
      const range = (ps: readonly Pt2[]) => ps.map((r) => r.x * axis.x + r.y * axis.y)
      const ra = range(a)
      const rb = range(b)
      if (Math.max(...ra) <= Math.min(...rb) || Math.max(...rb) <= Math.min(...ra)) return false
    }
  }
  return true
}

type Kept = { quad: readonly Pt2[]; box: Rect }

function boxOf(q: readonly Pt2[]): Rect {
  const xs = q.map((p) => p.x)
  const ys = q.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

const boxesMeet = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * Greedy: higher priority first (ties keep input order); a label that overlaps an accepted one is hidden.
 * A bounding-box test screens out most pairs before the exact test, so 600 labels stay cheap per frame.
 */
export function hideCollisions(items: readonly Placed[]): Set<string> {
  const order = items.map((p, i) => ({ p, i })).sort((a, b) => b.p.priority - a.p.priority || a.i - b.i)
  const kept: Kept[] = []
  const hidden = new Set<string>()
  for (const { p } of order) {
    const box = p.quad.length < 3 ? null : boxOf(p.quad)
    if (!box || kept.some((k) => boxesMeet(k.box, box) && convexOverlap(k.quad, p.quad))) hidden.add(p.id)
    else kept.push({ quad: p.quad, box })
  }
  return hidden
}

/** Collision priority: forced labels first, then notable status (vacant, expiring), then the rest; dimmed last. */
export function labelPriority(c: LabelContent, forced: boolean, dimmed: boolean): number {
  if (forced) return 4
  if (dimmed) return 1
  return c.notable ? 3 : 2
}

export type Pt2 = { x: number; y: number }

/**
 * The upright rectangle a label fills on a projected face [top-left, top-right, bottom-right, bottom-left]: the
 * face's inner bounds (right of both left corners, left of both right corners, below both top corners, above
 * both bottom corners). It lies inside any face whose sides are not turned past the diagonal, which covers the
 * facade and the top faces seen from the app's viewpoints. A face too slanted for one gives an empty rectangle
 * at its centre.
 */
export function innerRect(q: readonly [Pt2, Pt2, Pt2, Pt2]): Rect {
  const [tl, tr, br, bl] = q
  const x0 = Math.max(tl.x, bl.x)
  const x1 = Math.min(tr.x, br.x)
  const y0 = Math.max(tl.y, tr.y)
  const y1 = Math.min(bl.y, br.y)
  const w = Math.max(x1 - x0, 0)
  const h = Math.max(y1 - y0, 0)
  return { x: w > 0 ? x0 : (x0 + x1) / 2, y: h > 0 ? y0 : (y0 + y1) / 2, w, h }
}

/** y on the straight edge from `p` to `q` at `x` (clamped to the edge's ends). */
function edgeY(p: Pt2, q: Pt2, x: number): number {
  if (q.x === p.x) return (p.y + q.y) / 2
  const t = Math.min(Math.max((x - p.x) / (q.x - p.x), 0), 1)
  return p.y + (q.y - p.y) * t
}

type Quad = readonly [Pt2, Pt2, Pt2, Pt2]

/** Height of the upright box over [a, b] inside the face: below the top edge, above the bottom edge at both ends. */
function spanHeight(q: Quad, a: number, b: number): number {
  const [tl, tr, br, bl] = q
  return Math.min(edgeY(bl, br, a), edgeY(bl, br, b)) - Math.max(edgeY(tl, tr, a), edgeY(tl, tr, b))
}

/** How far a box at least `h` tall reaches from the column at `from` towards `to` (bisection); -1 when none. */
function reach(q: Quad, from: number, to: number, h: number): number {
  if (spanHeight(q, from, from) < h) return -1
  if (spanHeight(q, Math.min(from, to), Math.max(from, to)) >= h) return Math.abs(to - from)
  let lo = from
  let hi = to
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (spanHeight(q, Math.min(from, mid), Math.max(from, mid)) >= h) lo = mid
    else hi = mid
  }
  return Math.abs(lo - from)
}

const spanOf = (q: Quad) => ({ left: Math.max(q[0].x, q[3].x), right: Math.min(q[1].x, q[2].x) })

/**
 * The widest upright box at least `h` tall inside the face; null when none is. A face seen at an angle slopes on
 * screen, so the full-width inner bounds can be too thin for a line even where a shorter box (all a label needs)
 * fits easily. The box grows from the face's left side and from its right side and the wider wins (the left on a
 * tie), so a face and its mirror image (the camera orbits either way) get the same box, mirrored.
 */
export function uprightBox(q: Quad, h: number): Rect | null {
  const { left, right } = spanOf(q)
  if (right <= left) return null
  const fromLeft = reach(q, left, right, h)
  const fromRight = reach(q, right, left, h)
  if (fromLeft < 0 && fromRight < 0) return null
  const a = fromLeft >= fromRight ? left : right - fromRight
  const b = fromLeft >= fromRight ? left + fromLeft : right
  const [tl, tr] = q
  return { x: a, y: Math.max(edgeY(tl, tr, a), edgeY(tl, tr, b)), w: b - a, h: Math.max(spanHeight(q, a, b), 0) }
}

/** Whether the face's tallest column (an end: the edges are straight) is at least `h` tall. */
function tallEnough(q: Quad, h: number): boolean {
  const { left, right } = spanOf(q)
  return right > left && Math.max(spanHeight(q, left, left), spanHeight(q, right, right)) >= h
}

export type Fit = { box: Rect; parts: Parts }

/**
 * The upright box and parts that show the most of a label on a face: a box tall enough for two lines, one
 * for a single line, or the face's inner bounds, whichever shows more (the first on a tie). A face thinner
 * than MIN_FACE_H gets only its inner bounds, so it shows a label only when forced. Runs per suite per frame:
 * a box is only computed when it can be used (a full-width two-line box makes the one-line box the same).
 */
export function fitLabel(c: LabelContent, q: Quad, forced: boolean): Fit {
  const inner = innerRect(q)
  const thick = tallEnough(q, MIN_FACE_H)
  let best: Fit = { box: inner, parts: thick || forced ? chooseParts(c, inner, forced) : NONE }
  if (!thick) return best
  const consider = (box: Rect | null) => {
    if (!box) return
    const parts = chooseParts(c, box, forced)
    if (shown(c, parts, box.w) >= shown(c, best.parts, best.box.w)) best = { box, parts }
  }
  const two = uprightBox(q, TWO_LINES_H)
  const { left, right } = spanOf(q)
  if (!two || two.w < right - left) consider(uprightBox(q, ONE_LINE_H))
  consider(two)
  return best
}
