import { Vector3, type Camera } from 'three'
import {
  chooseParts, hideCollisions, labelPriority, labelSize, mapPoint, rectToQuad, toMatrix3d, turnLabel, turnQuad, type LabelContent, type Placed,
} from '../labels3d'
import { labelDepth, labelFace, suiteRect, type Corner, type FaceRect, type Layout3D, type SuiteBox } from '../layout3d'
import type { SuiteVisual } from '../../stack/suiteVisual'
import { write, type OverlayRefs } from './overlayRefs'

// Each rendered frame: project every suite's label face (the front face, or the top face with floors
// separated) to the canvas, choose what its label can say at
// that size, hide labels that would collide, and move the floor numbers, rank badges and rings with the
// camera. Only changed values touch the DOM.

export type OverlayState = {
  camera: Camera
  width: number
  height: number
  layout: Layout3D
  visuals: ReadonlyMap<string, SuiteVisual>
  contents: ReadonlyMap<string, LabelContent>
  ghosts: ReadonlySet<string>
  hoverId: string | null
  focusedId: string | null
  refs: OverlayRefs
}

type Pt = { x: number; y: number; behind: boolean }

const tmp = new Vector3()
const RING_GAP = 0.05 // world units between a face and its ring

type Projector = Pick<OverlayState, 'camera' | 'width' | 'height'>

function project(s: Projector, x: number, y: number, z: number): Pt {
  tmp.set(x, y, z).project(s.camera)
  return { x: ((tmp.x + 1) / 2) * s.width, y: ((1 - tmp.y) / 2) * s.height, behind: tmp.z > 1 }
}

/** A label face projected: [top-left, top-right, bottom-right, bottom-left] on screen. */
function faceQuad(s: Projector & { layout: Layout3D }, r: FaceRect, pad = 0, depth?: number): Pt[] {
  return labelFace(r, s.layout.onTop, pad, depth).map((c: Corner) => project(s, ...c))
}

const eyeOf = (s: Projector): Corner => [s.camera.position.x, s.camera.position.y, s.camera.position.z]

/**
 * With floors separated, the part of a suite's top face the floor above leaves in view from the camera
 * (0 when too little shows for a label); in floor view the shown floor's whole top face (0 below it);
 * undefined on the facade, where the whole front face is used.
 */
const stripOf = (s: Projector & { layout: Layout3D }, b: SuiteBox) => labelDepth(s.layout, b, eyeOf(s))

/** A ring or click target never collapses to nothing, even where the label strip does. */
const ringDepth = (d: number | undefined) => (d === undefined ? undefined : Math.max(d, 0.3))

const suiteQuad = (s: OverlayState, b: SuiteBox, pad = 0) => faceQuad(s, suiteRect(b), pad, ringDepth(stripOf(s, b)))

const px = (n: number) => `${Math.round(n * 10) / 10}px`

type LabelPlan = { id: string; w: number; h: number; transform: string; parts: string; lines: string; forced: boolean; turned: boolean }

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** The label box in the face's own pixels and the transform that lays it onto the projected face. */
function onFace(pts: readonly Pt[]) {
  const [tl, tr, br, bl] = pts as [Pt, Pt, Pt, Pt]
  const w = (dist(bl, br) + dist(tl, tr)) / 2
  const h = (dist(bl, tl) + dist(br, tr)) / 2
  return { w, h, m: rectToQuad([tl, tr, br, bl], w, h) }
}

function planLabel(s: OverlayState, b: SuiteBox): { plan: LabelPlan; placed: Placed } | null {
  const v = s.visuals.get(b.id)
  const c = s.contents.get(b.id)
  if (!v || !c) return null
  const strip = stripOf(s, b)
  const across = faceQuad(s, suiteRect(b), 0, ringDepth(strip)) as [Pt, Pt, Pt, Pt]
  const forced = v.matchRank !== null || v.selected || b.id === s.hoverId || b.id === s.focusedId
  // Floor view: on a narrow but deep top face the label runs along the depth when it shows more that way.
  const turned = s.layout.focus?.floor === b.floor && turnLabel(c, onFace(across), forced)
  const pts = turned ? turnQuad(across) : across
  const { w, h, m } = onFace(pts)
  const p = pts.some((q) => q.behind) || strip === 0 ? null : chooseParts(c, { w, h }, forced)
  const parts = p ? (['cue', 'number', 'tenant', 'sf'] as const).filter((k) => p[k]) : []
  const size = p ? labelSize(c, p, w) : { w: 0, h: 0 }
  const top = (h - size.h) / 2
  const quad = size.w > 0 ? [mapPoint(m, 0, top), mapPoint(m, size.w, top), mapPoint(m, size.w, top + size.h), mapPoint(m, 0, top + size.h)] : []
  return {
    plan: { id: b.id, w, h, transform: toMatrix3d(m), parts: parts.join(' '), lines: String(p?.lines ?? 0), forced, turned },
    placed: { id: b.id, quad, priority: labelPriority(c, forced, s.ghosts.has(b.id)) },
  }
}

function syncLabels(s: OverlayState): void {
  const planned = s.layout.suites.flatMap((b) => planLabel(s, b) ?? [])
  const hidden = hideCollisions(planned.map((p) => p.placed))
  for (const { plan: p } of planned) {
    const el = s.refs.labels.get(p.id)
    if (!el) continue
    write(el, 'width', px(p.w))
    write(el, 'height', px(p.h))
    write(el, 'transform', p.transform)
    write(el, 'data-parts', p.parts)
    write(el, 'data-lines', p.lines)
    write(el, 'data-forced', String(p.forced))
    write(el, 'data-turned', String(p.turned))
    write(el, 'data-focused', String(p.id === s.focusedId))
    write(el, 'data-hidden', String(hidden.has(p.id) || p.parts === ''))
  }
}

function syncTags(s: OverlayState): void {
  for (const t of s.layout.tags) {
    const el = s.refs.tags.get(t.floor)
    if (!el) continue
    const p = project(s, t.x, t.y, t.z)
    write(el, 'left', px(p.x))
    write(el, 'top', px(p.y))
  }
}

const points = (pts: readonly Pt[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

function setRing(s: OverlayState, key: string, pts: readonly Pt[] | null): void {
  const el = s.refs.rings.get(key)
  if (!el) return
  write(el, 'data-on', String(pts !== null))
  if (pts) write(el, 'points', points(pts))
}

function syncRuns(s: OverlayState): void {
  for (const r of s.layout.runs) {
    const inRun = s.layout.suites.filter((b) => b.floor === r.floor && b.x > r.x0 && b.x < r.x1)
    const depth = ringDepth(s.layout.onTop ? Math.min(...inRun.map((b) => stripOf(s, b) ?? 0)) : undefined)
    const outer = faceQuad(s, r, RING_GAP * 2, depth)
    setRing(s, `run-${r.rank}`, outer)
    setRing(s, `run-${r.rank}-inner`, faceQuad(s, r, RING_GAP, depth))
    const badge = s.refs.badges.get(r.rank)
    const corner = outer[0]
    if (badge && corner) {
      write(badge, 'left', px(corner.x))
      write(badge, 'top', px(corner.y))
    }
  }
}

function syncStateRings(s: OverlayState): void {
  const box = (id: string | null) => (id === null ? undefined : s.layout.suites.find((b) => b.id === id))
  const selected = s.layout.suites.find((b) => s.visuals.get(b.id)?.selected)
  const focused = box(s.focusedId)
  setRing(s, 'selected', selected ? suiteQuad(s, selected, RING_GAP * 2.2) : null)
  setRing(s, 'selected-inner', selected ? suiteQuad(s, selected, RING_GAP) : null)
  setRing(s, 'focus', focused ? suiteQuad(s, focused, RING_GAP * 3.6) : null)
}

export function syncOverlay(s: OverlayState): void {
  syncLabels(s)
  syncTags(s)
  syncRuns(s)
  syncStateRings(s)
}

/** The canvas point at the centre of a suite's label face (where a click lands on that suite). */
export function faceCentre(s: Projector & { layout: Layout3D }, b: SuiteBox): { x: number; y: number } {
  const c = labelFace(suiteRect(b), s.layout.onTop, 0, ringDepth(stripOf(s, b)))
  const mid = [0, 1, 2].map((k) => c.reduce((sum, q) => sum + q[k as 0 | 1 | 2], 0) / 4) as Corner
  const p = project(s, ...mid)
  return { x: Math.round(p.x), y: Math.round(p.y) }
}
