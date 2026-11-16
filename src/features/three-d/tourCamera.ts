import { FOV_Y, type Vec3, type View } from './camera'
import { DEPTH, PITCH, type Bounds, type Box } from './layout3d'

// The suite tour's camera: where it stands outside to show the stop's floor, where it stands inside the suite,
// where it looks and how it pans. Pure numbers on plain tuples (axes as in layout3d.ts: x along the facade,
// y up, z out of the facade towards the street), so it is testable without three.

/** One floor to floor (PITCH, one world unit) stands for about 4 m, so standing eye height (1.6 m) is 0.4. */
export const METRES_PER_FLOOR = 4
export const EYE_HEIGHT = (1.6 / METRES_PER_FLOOR) * PITCH

export const EXTERIOR_FOV = FOV_Y
/** Inside: a person's field of view, wide enough to read a room (vertical degrees). */
export const INTERIOR_FOV = 60
/** The near plane inside, so the floor a step ahead is not clipped (the exterior camera's is 0.5). */
export const INTERIOR_NEAR = 0.05
export const EXTERIOR_NEAR = 0.5

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
