import type { Bounds } from './layout3d'

// Camera framing for the 3D building. Pure vector maths on plain tuples, so it is testable without three.

export type Vec3 = [number, number, number]
export type Insets = { top: number; right: number; bottom: number; left: number } // CSS px kept clear of the building
export type View = { azimuth: number; elevation: number } // degrees; azimuth 0 = straight at the front, + = from the right

export const FOV_Y = 20
/** Stages at least this wide for their height stack the camera controls down the right edge, not across the top. */
export const WIDE_STAGE = 1.5

/**
 * Canvas px kept clear of the building: the control bar (across the top, or down the right on a wide stage,
 * where the building is height-bound and has room to the side), floor numbers (left), badges and rings.
 * Must match the container query in three-d.module.css.
 */
export function insetsFor(width: number, height: number): Insets {
  return width >= height * WIDE_STAGE
    ? { top: 16, right: 158, bottom: 16, left: 40 }
    : { top: 48, right: 18, bottom: 16, left: 40 }
}
export const DEFAULT_VIEW: View = { azimuth: 16, elevation: 14.5 }
export const SEPARATED_VIEW: View = { azimuth: 12, elevation: 32 }
export const AZIMUTH_LIMIT = 50
export const ELEVATION_RANGE = { min: 3, max: 62 }

const rad = (deg: number) => (deg * Math.PI) / 180

/** The view part-way (t = 0..1) from `a` to `b`. */
export const lerpView = (a: View, b: View, t: number): View =>
  ({ azimuth: a.azimuth + (b.azimuth - a.azimuth) * t, elevation: a.elevation + (b.elevation - a.elevation) * t })

/** The view (degrees) of a camera offset from its target by `o`; the inverse of viewDirection. */
export function viewOf(o: Vec3): View {
  const r = Math.hypot(...o)
  return { azimuth: (Math.atan2(o[0], o[2]) * 180) / Math.PI, elevation: r === 0 ? 0 : (Math.asin(o[1] / r) * 180) / Math.PI }
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const norm = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(...a))
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** Unit vector from the target towards the camera. */
export function viewDirection(v: View): Vec3 {
  const az = rad(v.azimuth)
  const el = rad(v.elevation)
  return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]
}

export function corners(b: Bounds): Vec3[] {
  const out: Vec3[] = []
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z])
  return out
}

export const centre = (b: Bounds): Vec3 => scale(add(b.min, b.max), 0.5)

/**
 * The smallest camera distance from `target` along `dir` at which every corner projects inside a frustum
 * of half-angle tangents `tanH` × `tanV`.
 */
export function fitDistance(points: readonly Vec3[], target: Vec3, dir: Vec3, tanH: number, tanV: number): number {
  const right = norm(cross([0, 1, 0], dir))
  const up = cross(dir, right)
  return points.reduce((d, p) => {
    const o = sub(p, target)
    const z = dot(o, dir) // towards the camera
    const need = Math.max(Math.abs(dot(o, right)) / tanH, Math.abs(dot(o, up)) / tanV) + z
    return Math.max(d, need)
  }, 0)
}

/** Moves `target` across the view so the projected extents of `points` are centred at distance `d`. */
function recentre(points: readonly Vec3[], target: Vec3, dir: Vec3, d: number): Vec3 {
  const right = norm(cross([0, 1, 0], dir))
  const up = cross(dir, right)
  const tx = points.map((p) => { const o = sub(p, target); return dot(o, right) / (d - dot(o, dir)) })
  const ty = points.map((p) => { const o = sub(p, target); return dot(o, up) / (d - dot(o, dir)) })
  const cx = ((Math.min(...tx) + Math.max(...tx)) / 2) * d
  const cy = ((Math.min(...ty) + Math.max(...ty)) / 2) * d
  return add(target, add(scale(right, cx), scale(up, cy)))
}

export type Pose = { position: Vec3; target: Vec3; distance: number }

/** The camera pose that frames `bounds` from `view` in a canvas of `size` px, keeping `insets` clear. */
export function framePose(bounds: Bounds, view: View, size: { width: number; height: number }, insets: Insets): Pose {
  const w = Math.max(size.width - insets.left - insets.right, 1)
  const h = Math.max(size.height - insets.top - insets.bottom, 1)
  const tanFull = Math.tan(rad(FOV_Y / 2))
  const tanV = tanFull * (h / Math.max(size.height, 1))
  const tanH = tanFull * (w / Math.max(size.height, 1))
  const dir = viewDirection(view)
  const pts = corners(bounds)
  // Perspective makes the near corners spread further than the far ones: re-centre the target on the
  // projected extents a few times so the margins come out even.
  const target = [0, 1, 2].reduce((t) => recentre(pts, t, dir, fitDistance(pts, t, dir, tanH, tanV)), centre(bounds))
  const distance = fitDistance(pts, target, dir, tanH, tanV)
  return { position: add(target, scale(dir, distance)), target, distance }
}

/** The projection shift that centres the building in the area left by the insets (camera.setViewOffset x, y). */
export function viewShift(insets: Insets): { x: number; y: number } {
  return { x: -(insets.left - insets.right) / 2, y: -(insets.top - insets.bottom) / 2 }
}

/** A camera's distance, and that distance ÷ the full-building framing distance at its angle. */
export type Zoom = { d: number; ratio: number }

/**
 * Whether the user is zoomed in past the framing after an interaction that began at `from`. A zoom (the
 * distance changed) is judged by where it ended; an orbit (same distance) by where it began, because turning
 * the building changes the framing distance without the user zooming.
 */
export function zoomedIn(from: Zoom, to: Zoom): boolean {
  return Math.abs(to.d - from.d) > 1e-3 ? to.ratio < 0.999 : from.ratio < 0.999
}

/**
 * Where the camera is relative to a framing pose: the change in angle (degrees), the distance as a multiple,
 * and how far the target moved. Measured from the camera itself, so a turn or zoom the controls clamped is
 * stored as clamped.
 */
export type Offset = { azimuth: number; elevation: number; factor: number; shift: Vec3 }
export const NO_OFFSET: Offset = { azimuth: 0, elevation: 0, factor: 1, shift: [0, 0, 0] }

type Placed = { position: Vec3; target: Vec3 }

export function offsetBetween(frame: Placed, now: Placed): Offset {
  const f = viewOf(sub(frame.position, frame.target))
  const n = viewOf(sub(now.position, now.target))
  const fd = Math.hypot(...sub(frame.position, frame.target))
  const nd = Math.hypot(...sub(now.position, now.target))
  const shift = sub(now.target, frame.target)
  const round = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v)
  return {
    azimuth: round(n.azimuth - f.azimuth),
    elevation: round(n.elevation - f.elevation),
    factor: fd === 0 ? 1 : Math.abs(nd / fd - 1) < 1e-9 ? 1 : nd / fd,
    shift: shift.map(round) as Vec3,
  }
}

/** The camera placement `o` away from `frame`; the inverse of offsetBetween for the same framing. */
export function applyOffset(frame: Placed, o: Offset): Placed {
  const v = viewOf(sub(frame.position, frame.target))
  const d = Math.hypot(...sub(frame.position, frame.target)) * o.factor
  const target = add(frame.target, o.shift)
  const dir = viewDirection({ azimuth: v.azimuth + o.azimuth, elevation: v.elevation + o.elevation })
  return { position: add(target, scale(dir, d)), target }
}
