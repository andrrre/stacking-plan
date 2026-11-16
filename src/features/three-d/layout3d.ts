import { outlineRuns } from '../stack/segments'
import type { FloorVisual, StackModel } from '../stack/suiteVisual'
import { overlayActive } from './palette'

// Where every box of the 3D building goes, in world units. Pure: a StackModel in, boxes out.
// Axes: x to the right along the facade, y up, z towards the viewer. The building stands on a plinth on
// y = 0, centred on x = 0 and z = 0; every suite's front face is at z = DEPTH / 2 (+ LIFT when lifted).

export const PLATE_W = 18 // the largest floor plate
export const DEPTH = 8.2 // suite depth, the same on every floor: under half the widest plate, an office floor
export const SUITE_H = 0.87 // tall in the pitch, so the default view's faces hold a two-line label
export const SLAB_T = 0.08 // thin, so a suite can be tall and still clear the slab above (a 0.05 gap)
export const PITCH = 1 // floor to floor, floors together
export const SPREAD_PITCH = 3.2 // floor to floor, floors separated
export const SUITE_GAP = 0.08
export const SLAB_MARGIN = 0.16 // the slab's overhang around its suites
export const LIFT = 0.32 // how far a highlighted suite stands out of the facade
export const PLINTH_H = 0.3
export const PLINTH_MARGIN = 0.5
export const CAP_T = 0.08 // roof cap (top floor, and a terrace where a floor is wider than the one above)
/**
 * With floors separated, labels lie on the front strip of each suite's top face: the part the floor above
 * leaves in view from the separated viewpoint ((SPREAD_PITCH - SLAB_T - SUITE_H) / tan(32°) ≈ 3.6).
 */
export const TOP_LABEL_DEPTH = 3.25

export type Box = { x: number; y: number; z: number; w: number; h: number; d: number } // centre and size

/** The underside of the floor above a suite: what can hide the suite's top face from a raised eye. */
export type Cover = { y: number; x0: number; x1: number; z: number }

export type SuiteBox = Box & { id: string; floor: number; row: number; col: number; lifted: boolean; cover: Cover | null }
export type SlabBox = Box & { floor: number }
/** A match outline: the front rectangle around a run of suites, at the run's front plane. */
export type RunRect = { floor: number; rank: number; x0: number; x1: number; y0: number; y1: number; z: number }
/**
 * Where a floor number sits: just left of the plate, level with its suites' mid-height, by the slab's front-left
 * corner (z) or, when the camera sees the left side, its back-left corner (z = back), whichever shows further left.
 */
export type FloorTag = { floor: number; x: number; y: number; z: number; back: number }

export type Bounds = { min: [number, number, number]; max: [number, number, number] }

export type Layout3D = {
  suites: SuiteBox[]
  slabs: SlabBox[]
  caps: SlabBox[] // roof caps; none while the floors are (being) separated
  plinth: Box
  runs: RunRect[]
  tags: FloorTag[]
  bounds: Bounds
  onTop: boolean // labels and rings lie on the top faces (floors separated, or floor view)
  focus: { floor: number; bounds: Bounds } | null // floor view: the floor shown, and its plate's bounds to frame
}

export type Corner = [number, number, number]
export type FaceRect = { x0: number; x1: number; y0: number; y1: number; z: number }

export const suiteRect = (b: SuiteBox): FaceRect => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, y0: b.y - b.h / 2, y1: b.y + b.h / 2, z: b.z + b.d / 2 })

/**
 * The face a label (or ring) lies on, as [top-left, top-right, bottom-right, bottom-left] as seen by the
 * viewer, grown by `pad`: the front face, or with floors separated the front strip of the top face.
 */
export function labelFace(r: FaceRect, onTop: boolean, pad = 0, depth = TOP_LABEL_DEPTH): [Corner, Corner, Corner, Corner] {
  const [x0, x1] = [r.x0 - pad, r.x1 + pad]
  if (!onTop) return [[x0, r.y1 + pad, r.z], [x1, r.y1 + pad, r.z], [x1, r.y0 - pad, r.z], [x0, r.y0 - pad, r.z]]
  const back = r.z - depth - pad
  return [[x0, r.y1, back], [x1, r.y1, back], [x1, r.y1, r.z + pad], [x0, r.y1, r.z + pad]]
}

/** Suite widths on one plate: proportional to area, gaps taken out first. Equal widths if nothing has area. */
export function suiteWidths(areas: readonly number[], plateW: number, gap = SUITE_GAP): number[] {
  const n = areas.length
  if (n === 0) return []
  const usable = Math.max(plateW - gap * (n - 1), 0)
  const total = areas.reduce((s, a) => s + Math.max(a, 0), 0)
  return areas.map((a) => (total > 0 ? (Math.max(a, 0) / total) * usable : usable / n))
}

function floorBoxes(f: FloorVisual, row: number, y0: number, active: boolean): SuiteBox[] {
  const plateW = (PLATE_W * f.widthPct) / 100
  const widths = suiteWidths(f.suites.map((v) => v.suite.areaSf), plateW)
  const y = y0 + SLAB_T + SUITE_H / 2
  return f.suites.map((v, col) => {
    const left = -plateW / 2 + widths.slice(0, col).reduce((s, w) => s + w, 0) + col * SUITE_GAP
    const w = widths[col] ?? 0
    const lifted = active && !v.dimmed
    return { id: v.suite.id, floor: f.number, row, col, lifted, x: left + w / 2, y, z: lifted ? LIFT : 0, w, h: SUITE_H, d: DEPTH, cover: null }
  })
}

function runRects(f: FloorVisual, boxes: readonly SuiteBox[]): RunRect[] {
  return outlineRuns(f.runs).flatMap((r) => {
    const first = boxes[r.first]
    const last = boxes[r.last]
    if (!first || !last) return []
    const z = Math.max(...boxes.slice(r.first, r.last + 1).map((b) => b.z + b.d / 2))
    return [{ floor: f.number, rank: r.rank, x0: first.x - first.w / 2, x1: last.x + last.w / 2, y0: first.y - first.h / 2, y1: first.y + first.h / 2, z }]
  })
}

function boundsOf(plinth: Box, top: number): Bounds {
  return { min: [-plinth.w / 2, 0, -plinth.d / 2], max: [plinth.w / 2, top, plinth.d / 2] }
}

/** A cap on every floor whose roof is open to the sky: the top floor, and any floor wider than the one above. */
function capsOf(slabs: readonly SlabBox[]): SlabBox[] {
  return slabs.flatMap((s, i) => {
    const above = slabs[i - 1]
    if (above && above.w >= s.w) return []
    return [{ ...s, y: s.y - SLAB_T / 2 + SLAB_T + SUITE_H + CAP_T / 2 + 0.01, h: CAP_T }]
  })
}

/** A top-face label strip thinner than this (world units) is not drawn: it would read as a sliver. */
export const MIN_TOP_STRIP = 0.9

/**
 * How deep (from the front edge) a suite's top face is visible from `eye`, given the floor above. A ray
 * from the eye to a point on the top face must pass in front of the floor above's front edge at the height
 * of its underside. Ignores sideways obliquity, which does not change that test.
 */
export function visibleTopDepth(b: SuiteBox, eye: Corner): number {
  const top = b.y + b.h / 2
  const front = b.z + b.d / 2
  if (eye[1] <= top) return 0
  const c = b.cover
  const covered = c !== null && b.x + b.w / 2 > c.x0 && b.x - b.w / 2 < c.x1
  if (!c || !covered || eye[1] <= c.y) return b.d
  const reach = ((eye[2] - c.z) * (eye[1] - top)) / (eye[1] - c.y) - (eye[2] - front)
  return Math.min(Math.max(reach, 0), b.d)
}

/** The depth of a suite's top-face label strip seen from `eye`, or 0 when too little of the face shows. */
export function topStrip(b: SuiteBox, eye: Corner): number {
  const depth = Math.min(TOP_LABEL_DEPTH, visibleTopDepth(b, eye) - 0.15)
  return depth >= MIN_TOP_STRIP ? depth : 0
}

/** `spread` is 0 (floors together) to 1 (separated). Floors are numbered from the model (highest first). */
export function buildingLayout(model: StackModel, spread = 0): Layout3D {
  const t = Math.min(Math.max(spread, 0), 1)
  const pitch = PITCH + (SPREAD_PITCH - PITCH) * t
  const active = overlayActive(model.floors.flatMap((f) => f.suites))
  const count = model.floors.length
  const perFloor = model.floors.map((f, row) => {
    const y0 = PLINTH_H + (count - 1 - row) * pitch
    const plateW = (PLATE_W * f.widthPct) / 100
    const suites = floorBoxes(f, row, y0, active)
    const slab: SlabBox = { floor: f.number, x: 0, y: y0 + SLAB_T / 2, z: 0, w: plateW + 2 * SLAB_MARGIN, h: SLAB_T, d: DEPTH + 2 * SLAB_MARGIN }
    const tag: FloorTag = { floor: f.number, x: -plateW / 2 - SLAB_MARGIN, y: y0 + SLAB_T + SUITE_H / 2, z: DEPTH / 2 + SLAB_MARGIN, back: -DEPTH / 2 - SLAB_MARGIN }
    return { suites, slab, tag, runs: runRects(f, suites) }
  })
  const slabs = perFloor.map((p) => p.slab)
  const suites = perFloor.flatMap((p, i) => {
    const above = slabs[i - 1]
    const cover = above ? { y: above.y - above.h / 2, x0: above.x - above.w / 2, x1: above.x + above.w / 2, z: above.z + above.d / 2 } : null
    return p.suites.map((b) => ({ ...b, cover }))
  })
  const widest = Math.max(...slabs.map((s) => s.w), PLATE_W + 2 * SLAB_MARGIN)
  const plinth: Box = { x: 0, y: PLINTH_H / 2, z: 0, w: widest + 2 * PLINTH_MARGIN, h: PLINTH_H, d: DEPTH + 2 * SLAB_MARGIN + 2 * PLINTH_MARGIN }
  const caps = t > 0 ? [] : capsOf(slabs)
  const top = PLINTH_H + (count === 0 ? 0 : (count - 1) * pitch + SLAB_T + SUITE_H) + (caps.length > 0 ? CAP_T + 0.01 : 0)
  return {
    suites,
    slabs,
    caps,
    plinth,
    runs: perFloor.flatMap((p) => p.runs),
    tags: perFloor.map((p) => p.tag),
    bounds: boundsOf(plinth, top),
    onTop: t >= 0.5,
    focus: null,
  }
}

/**
 * The plinth's half extents and the height with the floors together, as buildingLayout(model, 0) gives them,
 * without laying out every suite (the sketched city is sized by these).
 */
export function buildingSite(model: StackModel): { halfW: number; halfD: number; height: number } {
  const count = model.floors.length
  const widest = Math.max(...model.floors.map((f) => (PLATE_W * f.widthPct) / 100 + 2 * SLAB_MARGIN), PLATE_W + 2 * SLAB_MARGIN)
  const roof = count === 0 ? 0 : (count - 1) * PITCH + SLAB_T + SUITE_H + CAP_T + 0.01
  return { halfW: widest / 2 + PLINTH_MARGIN, halfD: (DEPTH + 2 * SLAB_MARGIN + 2 * PLINTH_MARGIN) / 2, height: PLINTH_H + roof }
}

/** How far a floor-view label stops short of the top face's back edge (world units). */
const FOCUS_LABEL_INSET = 0.2

/**
 * Floor view: `floor` with nothing above it (suites, slabs, roof caps, outlines and floor numbers of higher
 * floors are gone, and so is its own roof cap) and the floors below as context, floors together. Matches
 * keep their outline but are not lifted, so they stay on the plate. A floor the model lacks gives the
 * whole building.
 */
export function floorLayout(model: StackModel, floor: number): Layout3D {
  const whole = buildingLayout(model, 0)
  const slab = whole.slabs.find((s) => s.floor === floor)
  if (!slab) return whole
  const below = <T extends { floor: number }>(xs: readonly T[]) => xs.filter((x) => x.floor <= floor)
  const top = slab.y - slab.h / 2 + SLAB_T + SUITE_H
  return {
    ...whole,
    suites: below(whole.suites).map((b) => ({ ...b, z: 0, lifted: false, cover: b.floor === floor ? null : b.cover })),
    slabs: below(whole.slabs),
    caps: whole.caps.filter((c) => c.floor < floor),
    runs: whole.runs.filter((r) => r.floor === floor).map((r) => ({ ...r, z: DEPTH / 2 })),
    tags: below(whole.tags),
    onTop: true,
    focus: { floor, bounds: { min: [-slab.w / 2, slab.y - slab.h / 2, -slab.d / 2], max: [slab.w / 2, top, slab.d / 2] } },
  }
}

/**
 * How deep (from the front edge) a suite's label lies on its top face, seen from `eye`; undefined when
 * labels are on the front faces. In floor view the shown floor's whole top face is free and the floors
 * below carry no labels (0).
 */
export function labelDepth(l: Pick<Layout3D, 'onTop' | 'focus'>, b: SuiteBox, eye: Corner): number | undefined {
  if (!l.onTop) return undefined
  if (l.focus) return b.floor === l.focus.floor ? b.d - FOCUS_LABEL_INSET : 0
  return topStrip(b, eye)
}

/** A short string that changes only when the building's outline changes (to refit the camera). */
export function boundsKey(b: Bounds): string {
  return [...b.min, ...b.max].map((n) => n.toFixed(2)).join(',')
}
