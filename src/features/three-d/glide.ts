import type { Pose, Vec3 } from './camera'

// Camera glides and the zoom limits around them. Pure: the scene's frame loop asks where the camera is at
// a given time and which zoom limits to set; it moves the camera and the controls itself.

export const MAX_ZOOM_OUT = 1.7
/** How far zoom-in may go, as a share of the framing distance: a 25-floor facade reaches label height. */
export const MAX_ZOOM_IN = 0.3

/** The orbit controls' distance limits. */
export type Limits = { min: number; max: number }
export const OPEN_LIMITS: Limits = { min: 0, max: Infinity }
export const limitsFor = (fit: number): Limits => ({ min: fit * MAX_ZOOM_IN, max: fit * MAX_ZOOM_OUT })

/**
 * A camera glide of `ms` from `start`. `limit` is the framing distance of a glide between framings (into,
 * out of or within floor view): the zoom limits are open while it runs and are set from it when it ends or
 * is cut short. A settle glide (back to framing after an orbit) has null and never touches the limits.
 */
export type Glide = { from: { position: Vec3; target: Vec3 }; to: Pose; start: number; ms: number; limit: number | null }

const lerp = (a: Vec3, b: Vec3, e: number): Vec3 => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e]

/** Where the camera is at `now` (eased out), and whether the glide is over. */
export function glideAt(g: Glide, now: number): { position: Vec3; target: Vec3; done: boolean } {
  const k = Math.min(Math.max((now - g.start) / g.ms, 0), 1)
  const e = k * (2 - k)
  if (k >= 1) return { position: g.to.position, target: g.to.target, done: true }
  return { position: lerp(g.from.position, g.to.position, e), target: lerp(g.from.target, g.to.target, e), done: false }
}

/** The limits to set when `g` starts: open for a glide between framings, else unchanged (null). */
export const limitsDuring = (g: Glide): Limits | null => (g.limit === null ? null : OPEN_LIMITS)

/** The limits to set when `g` finishes or is stopped early (null: leave them). */
export const limitsAfter = (g: Glide | null): Limits | null => (g === null || g.limit === null ? null : limitsFor(g.limit))

/**
 * A refit while a glide between framings runs (the floors moving apart as floor view is left) moves where
 * it ends and keeps its progress, instead of snapping. A settle glide is not taken over (null).
 */
export function retarget(g: Glide, to: Pose, limit: number): Glide | null {
  return g.limit === null ? null : { ...g, to, limit }
}

/** Where a suite tour's camera is and looks, and its lens (vertical field of view, degrees). */
export type Shot = { position: Vec3; target: Vec3; fov: number }

/**
 * A way in by `point`: the flight curves from its start to `point` (a quadratic through `control`, so it arrives
 * there square to the facade), then runs straight on to its end; `k` is the share of the flight before `point`.
 */
export type Via = { point: Vec3; control: Vec3; k: number }

/** A suite tour flight: position, aim and lens move together, eased in and out over `ms` from `start` (by `via`, if set). */
export type TourGlide = { from: Shot; to: Shot; start: number; ms: number; via?: Via }

const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)

function lerpInto(out: Vec3, a: Readonly<Vec3>, b: Readonly<Vec3>, e: number): void {
  out[0] = a[0] + (b[0] - a[0]) * e
  out[1] = a[1] + (b[1] - a[1]) * e
  out[2] = a[2] + (b[2] - a[2]) * e
}

/** The position `e` (eased, 0…1) along a flight by `v`, written into `out`. */
function viaInto(out: Vec3, from: Readonly<Vec3>, v: Via, to: Readonly<Vec3>, e: number): void {
  if (e > v.k) {
    lerpInto(out, v.point, to, (e - v.k) / (1 - v.k))
    return
  }
  const s = v.k <= 0 ? 1 : e / v.k
  const a = (1 - s) * (1 - s)
  const b = 2 * s * (1 - s)
  const c = s * s
  out[0] = a * from[0] + b * v.control[0] + c * v.point[0]
  out[1] = a * from[1] + b * v.control[1] + c * v.point[1]
  out[2] = a * from[2] + b * v.control[2] + c * v.point[2]
}

const progress = (g: TourGlide, now: number) => (g.ms <= 0 ? 1 : Math.min(Math.max((now - g.start) / g.ms, 0), 1))

/** How far a tour flight is at `now`, eased as its camera moves (0 … 1). */
export const tourGlideEased = (g: TourGlide, now: number): number => easeInOut(progress(g, now))

/** Writes where a tour flight is at `now` into `out` (no allocation: it runs every frame); true once it has arrived. */
export function tourGlideAt(g: TourGlide, now: number, out: Shot): boolean {
  const k = progress(g, now)
  const e = easeInOut(k)
  if (g.via && k < 1) viaInto(out.position, g.from.position, g.via, g.to.position, e)
  else lerpInto(out.position, g.from.position, g.to.position, e)
  lerpInto(out.target, g.from.target, g.to.target, e)
  out.fov = g.from.fov + (g.to.fov - g.from.fov) * e
  return k >= 1
}
