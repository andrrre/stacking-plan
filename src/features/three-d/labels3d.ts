import type { SuiteVisual } from '../stack/suiteVisual'

// What a suite's facade label says, which parts fit on its face at the current zoom, and which labels
// give way when they would overlap. Pure: the scene feeds it projected face rectangles in CSS pixels.

export type LabelCue = { kind: 'clock' | 'lock' | 'word'; text: string }
export type LabelContent = { cue: LabelCue | null; number: string; tenant: string | null; sf: string }

/**
 * The model's label in facade priority order: status cue → number → tenant → SF.
 * The cue is the clock or lock date from the model, or the status word for vacant and potential space.
 * Words that would only repeat the cue ("Vacant", "Leased from 03/2027") are dropped.
 */
export function labelContent(v: SuiteVisual): LabelContent {
  const { label, status } = v
  const base = { number: label.number, sf: label.sf }
  if (label.cue) {
    const tenant = status.status === 'vacant' ? null : label.primary
    return { ...base, cue: { kind: label.cue.glyph, text: label.cue.text }, tenant }
  }
  if (status.status === 'vacant' && status.overlay === 'potential') {
    return { ...base, cue: { kind: 'word', text: 'Potential' }, tenant: label.reason ?? null }
  }
  if (status.status === 'vacant') return { ...base, cue: { kind: 'word', text: 'VACANT' }, tenant: label.tag ?? null }
  return { ...base, cue: null, tenant: label.primary }
}

export type Parts = { cue: boolean; number: boolean; tenant: boolean; sf: boolean; lines: 0 | 1 | 2 }
export type Size = { w: number; h: number }

export const LINE_H = 14
const PAD_X = 5
const GAP = 5
const GLYPH = 14 // glyph + its gap
const CHAR = 6.3 // average advance at 11–12px Inter
const MIN_TENANT = 44 // below this a truncated tenant is noise

/** Estimated text width in CSS px (the overlay uses Inter at 11–12px). */
export const textWidth = (s: string) => Math.ceil(s.length * CHAR)

export function cueWidth(c: LabelCue | null): number {
  if (!c) return 0
  return (c.kind === 'word' ? 0 : GLYPH) + textWidth(c.text)
}

type Line = { used: number; free: number }

/** Adds an item of width `w` to a line if it fits; returns the new line or null. */
function fit(line: Line, w: number): Line | null {
  const need = line.used === 0 ? w : w + GAP
  return need <= line.free ? { used: line.used + need, free: line.free - need } : null
}

const NONE: Parts = { cue: false, number: false, tenant: false, sf: false, lines: 0 }

/**
 * Which parts fit on a face of `box` px. Two lines when the face is tall enough (cue · number · SF over
 * the tenant), otherwise one (cue · number · tenant · SF). Parts are taken in priority order and a part
 * that does not fit is dropped. A forced label (matched, selected, hovered, focused) always keeps its cue
 * and number, even when they overflow the face.
 */
export function chooseParts(c: LabelContent, box: Size, forced: boolean): Parts {
  const lines: 0 | 1 | 2 = box.h >= 2 * LINE_H + 2 ? 2 : box.h >= LINE_H - 1 || forced ? 1 : 0
  if (lines === 0) return NONE
  const width = box.w - 2 * PAD_X
  const empty: Line = { used: 0, free: forced ? Number.MAX_SAFE_INTEGER : width }
  const withCue = c.cue ? fit(empty, cueWidth(c.cue)) : null
  const withNumber = fit(withCue ?? empty, textWidth(c.number))
  if (!withCue && !withNumber) return NONE
  const used = (withNumber ?? withCue ?? empty).used
  const head: Line = { used, free: width - used }
  const tenant = tenantFits(c, head, width, lines)
  const sfLine = lines === 1 && tenant ? fit(head, Math.min(textWidth(c.tenant ?? ''), head.free - GAP)) : head
  const sf = sfLine !== null && fit(sfLine, textWidth(c.sf)) !== null
  return { cue: withCue !== null, number: withNumber !== null, tenant, sf, lines }
}

function tenantFits(c: LabelContent, head: Line, width: number, lines: 1 | 2): boolean {
  if (c.tenant === null) return false
  const need = Math.min(textWidth(c.tenant), MIN_TENANT)
  return lines === 2 ? need <= width : need + GAP <= head.free
}

/** How much of a label shows with `p`: one per part, and a half more when the whole tenant name fits a line. */
function shown(c: LabelContent, p: Parts, w: number): number {
  const parts = [p.cue, p.number, p.tenant, p.sf].filter(Boolean).length
  return parts + (p.tenant && textWidth(c.tenant ?? '') <= w - 2 * PAD_X ? 0.5 : 0)
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

/** A face's corners [top-left, top-right, bottom-right, bottom-left] as a turned label lies on them: from the front-left corner towards the back. */
export function turnQuad<T>(q: readonly [T, T, T, T]): [T, T, T, T] {
  const [tl, tr, br, bl] = q
  return [bl, tl, tr, br]
}

const sumWidths = (ws: readonly number[]) => {
  const shown = ws.filter((w) => w > 0)
  return shown.reduce((s, w) => s + w, 0) + GAP * Math.max(shown.length - 1, 0)
}

/**
 * Estimated size of a label showing `parts`, in px. It is clipped to the face, except that a forced label's
 * cue and number may overflow it (they are never truncated).
 */
export function labelSize(c: LabelContent, parts: Parts, faceW: number): Size {
  if (parts.lines === 0) return { w: 0, h: 0 }
  const core = sumWidths([parts.cue ? cueWidth(c.cue) : 0, parts.number ? textWidth(c.number) : 0])
  const tenant = parts.tenant ? textWidth(c.tenant ?? '') : 0
  const sf = parts.sf ? textWidth(c.sf) : 0
  const full = parts.lines === 1 ? sumWidths([core, tenant, sf]) : Math.max(sumWidths([core, sf]), tenant)
  return { w: Math.min(full, Math.max(faceW - 2 * PAD_X, core)) + 2 * PAD_X, h: parts.lines * LINE_H + 2 }
}

export type Rect = { x: number; y: number; w: number; h: number }
/** A label's outline on screen: a convex quad (labels lie on faces, so they are rarely axis-aligned). */
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

/** Collision priority: forced labels first, then labels with a status cue, then the rest; ghosts last. */
export function labelPriority(c: LabelContent, forced: boolean, ghost: boolean): number {
  if (forced) return 4
  if (ghost) return 1
  return c.cue ? 3 : 2
}

export type Pt2 = { x: number; y: number }

/** A 2D projective map, X = (a·u + b·v + c) / (g·u + h·v + 1), Y = (d·u + e·v + f) / (g·u + h·v + 1). */
export type Homography = { a: number; b: number; c: number; d: number; e: number; f: number; g: number; h: number }

/**
 * The map from a w × h box (origin top-left) onto the quad [top-left, top-right, bottom-right, bottom-left],
 * so a label can be laid on a face exactly as the face is drawn, perspective included.
 */
export function rectToQuad(q: readonly [Pt2, Pt2, Pt2, Pt2], w: number, h: number): Homography {
  const [p0, p1, p2, p3] = q
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y
  const det = dx1 * dy2 - dx2 * dy1
  const g = det === 0 ? 0 : (dx3 * dy2 - dx2 * dy3) / det
  const hh = det === 0 ? 0 : (dx1 * dy3 - dx3 * dy1) / det
  const sw = w > 0 ? w : 1
  const sh = h > 0 ? h : 1
  return {
    a: (p1.x - p0.x + g * p1.x) / sw, b: (p3.x - p0.x + hh * p3.x) / sh, c: p0.x,
    d: (p1.y - p0.y + g * p1.y) / sw, e: (p3.y - p0.y + hh * p3.y) / sh, f: p0.y,
    g: g / sw, h: hh / sh,
  }
}

export function mapPoint(m: Homography, u: number, v: number): Pt2 {
  const z = m.g * u + m.h * v + 1
  return { x: (m.a * u + m.b * v + m.c) / z, y: (m.d * u + m.e * v + m.f) / z }
}

/** The homography as a CSS transform (with transform-origin 0 0). */
export function toMatrix3d(m: Homography): string {
  const n = (x: number) => (Math.abs(x) < 1e-9 ? '0' : String(Math.round(x * 1e6) / 1e6))
  return `matrix3d(${[m.a, m.d, 0, m.g, m.b, m.e, 0, m.h, 0, 0, 1, 0, m.c, m.f, 0, 1].map(n).join(',')})`
}
