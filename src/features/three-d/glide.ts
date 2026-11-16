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
