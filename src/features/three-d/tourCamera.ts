import { FOV_Y, type Vec3, type View } from './camera'
import type { Via } from './glide'
import { DEPTH, PITCH, SUITE_H, type Bounds, type Box } from './layout3d'
import { columnXs } from './tourRoom'

// The suite tour's camera: where it stands outside to show the stop's floor, where it stands inside the suite,
// where it looks and how it pans. Pure numbers on plain tuples (axes as in layout3d.ts: x along the facade,
// y up, z out of the facade towards the street), so it is testable without three.

/** One floor to floor (PITCH, one world unit) stands for about 4 m, so standing eye height (1.6 m) is 0.4. */
export const METRES_PER_FLOOR = 4
export const EYE_HEIGHT = (1.6 / METRES_PER_FLOOR) * PITCH

export const EXTERIOR_FOV = FOV_Y
/** Inside: a person's field of view, wide enough to read a room (vertical degrees). */
export const INTERIOR_FOV = 60
/** The near plane inside, so the floor a step ahead is not clipped. */
export const INTERIOR_NEAR = 0.05
/** The scene camera's own near plane (Scene3D), kept outside so depth stays precise out to the far plane. */
export const EXTERIOR_NEAR = 0.5
/** How close to the room's walls, floor or ceiling the camera takes the interior near plane (world units). */
const NEAR_REACH = 2 * EXTERIOR_NEAR
/** How far out of the facade the way into a suite turns square to it (world units; ≈ 6 m). */
export const APPROACH = 1.5

export const FLY_MS = 1400 // from wherever the camera is to the stop's floor, outside
export const ENTER_MS = 1600 // from outside into the suite
export const PAN_MS = 4000 // one slow look around
export const PAN_DEG = 25
export const EXIT_MS = 1200 // back out to the building
/** One stop's time when the tour plays on its own: the flights, the pan, and a few seconds to read the caption. */
export const STOP_MS = 9500

/** The eye stands this share of the suite's depth back from the window wall it looks out of: in the room, the view ahead. */
export const WINDOW_SHARE = 0.3
/**
 * Looking out a touch down, more the higher the floor (degrees): low down the neighbours stand across the window,
 * high up their roofs lie below it, and a level look would show only sky.
 */
export const LOOK_PITCH = { min: -3, max: -12, perUnit: -0.4 }
/** How far a drag may turn the look (degrees from straight out of the facade, and up/down). */
export const LOOK_LIMITS = { yaw: 75, pitchMin: -45, pitchMax: 25 }

/** The stop's floor area: x and z extents, and the height of its floor (the slab's top). */
export type Footprint = { x0: number; x1: number; z0: number; z1: number; floor: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** Where the eye stands and where it looks: yaw 0 = straight out of the facade (+z), + towards +x; pitch + up. */
export type Look = { eye: Vec3; yaw: number; pitch: number }

/** The union of the stop's suite boxes, over the full suite depth (a lifted suite stands out of the facade; its floor does not). */
export function footprint(boxes: readonly Box[]): Footprint | null {
  if (boxes.length === 0) return null
  return {
    x0: Math.min(...boxes.map((b) => b.x - b.w / 2)),
    x1: Math.max(...boxes.map((b) => b.x + b.w / 2)),
    z0: -DEPTH / 2,
    z1: DEPTH / 2,
    floor: Math.min(...boxes.map((b) => b.y - b.h / 2)),
  }
}

/**
 * Standing in the middle of the suite's width at eye height, looking out of its rear window wall (yaw 180, −z).
 * Every suite runs the plate's depth, so both of its long sides are window walls; the rear one faces the
 * sketched city (cityPlan keeps the street facade open: nothing stands in front of the building), so that is
 * the view out. The street front is behind the eye.
 */
export function interiorLook(f: Footprint): Look {
  const z = f.z0 + (f.z1 - f.z0) * WINDOW_SHARE
  const y = f.floor + EYE_HEIGHT
  return { eye: [(f.x0 + f.x1) / 2, y, z], yaw: 180, pitch: clamp(y * LOOK_PITCH.perUnit, LOOK_PITCH.max, LOOK_PITCH.min) }
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** The point one unit ahead of `eye` along `yaw` and `pitch` (degrees), written into `out`. */
export function lookTarget(eye: Readonly<Vec3>, yaw: number, pitch: number, out: Vec3 = [0, 0, 0]): Vec3 {
  const c = Math.cos(rad(pitch))
  out[0] = eye[0] + Math.sin(rad(yaw)) * c
  out[1] = eye[1] + Math.sin(rad(pitch))
  out[2] = eye[2] + Math.cos(rad(yaw)) * c
  return out
}

/** The look-around: one slow sine sweep to +PAN_DEG, over to -PAN_DEG and back, over PAN_MS; 0 outside it. */
export function panYaw(ms: number): number {
  if (ms <= 0 || ms >= PAN_MS) return 0
  return PAN_DEG * Math.sin((2 * Math.PI * ms) / PAN_MS)
}

/** Clamps a look: `yaw` turned from the stop's own view (degrees), `pitch` above the horizon. */
export function clampLook(yaw: number, pitch: number): { yaw: number; pitch: number } {
  return { yaw: clamp(yaw, -LOOK_LIMITS.yaw, LOOK_LIMITS.yaw), pitch: clamp(pitch, LOOK_LIMITS.pitchMin, LOOK_LIMITS.pitchMax) }
}

/** Floors shown below and above the stop's in the exterior shot. */
const BAND_BELOW = 2
const BAND_ABOVE = 3

/** The exterior shot frames the building's full width over a band of floors around the stop's (inside the building). */
export function exteriorBounds(f: Footprint, building: Bounds): Bounds {
  return {
    min: [building.min[0], Math.max(building.min[1], f.floor - BAND_BELOW * PITCH), building.min[2]],
    max: [building.max[0], Math.min(building.max[1], f.floor + BAND_ABOVE * PITCH), building.max[2]],
  }
}

/** The exterior shot's angle: come round towards the side the stop is on, a little above it. */
export function exteriorView(f: Footprint, building: Bounds): View {
  const half = Math.max((building.max[0] - building.min[0]) / 2, 1)
  const side = clamp(((f.x0 + f.x1) / 2) / half, -1, 1)
  return { azimuth: 6 + 18 * side, elevation: 9 }
}

/**
 * The near plane for a camera at `p`: the interior one in the stop's room or within reach of its walls (where the
 * exterior one would clip the columns and floor), else the exterior one. Switched where the camera crosses the
 * facade or roof line, not at a phase boundary.
 */
export function nearFor(p: Readonly<Vec3>, room: Footprint | null): number {
  if (!room) return EXTERIOR_NEAR
  const m = NEAR_REACH
  const inX = p[0] > room.x0 - m && p[0] < room.x1 + m
  const inZ = p[2] > room.z0 - m && p[2] < room.z1 + m
  const inY = p[1] > room.floor - m && p[1] < room.floor + SUITE_H + m
  return inX && inY && inZ ? INTERIOR_NEAR : EXTERIOR_NEAR
}

/** The middle of the facade bay nearest the suite's middle: a way in that passes no column. */
function bayMiddle(f: Footprint): number {
  const xs = columnXs(f.x0, f.x1)
  const centre = (f.x0 + f.x1) / 2
  const mids = xs.slice(1).map((x, i) => (x + (xs[i] ?? x)) / 2)
  return mids.reduce((best, m) => (Math.abs(m - centre) < Math.abs(best - centre) ? m : best), mids[0] ?? centre)
}

/**
 * The way into a suite from `from` (outside) to `eye`: curving round to a point APPROACH out of the facade at eye
 * height, in the middle of a bay near the suite's middle, then straight in, square to the facade, so even a narrow
 * suite is entered between its own columns and never through a neighbour. The share before the point is its share
 * of the length, so the speed carries on through it.
 */
export function enterVia(from: Readonly<Vec3>, f: Footprint, eye: Readonly<Vec3>): Via {
  const point: Vec3 = [bayMiddle(f), eye[1], f.z1 + APPROACH]
  const l1 = Math.hypot(point[0] - from[0], point[1] - from[1], point[2] - from[2])
  const l2 = Math.hypot(eye[0] - point[0], eye[1] - point[1], eye[2] - point[2])
  return { point, control: [point[0], point[1], point[2] + l1 / 2], k: l1 + l2 > 0 ? l1 / (l1 + l2) : 0 }
}
