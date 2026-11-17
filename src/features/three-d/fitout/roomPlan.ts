import { entryX, interiorLook, type Footprint } from '../tourCamera'
import { rectAt, rectD, rectW, type Rect } from './rect'

// The zones of a suite seen on a tour, before anything is put in it. Pure: a footprint in, rectangles out.
// Every suite runs the plate's depth: its rear facade is the window wall the eye looks out of (−z); a corridor
// runs along the street front (+z) behind a corridor wall with the entrance door in it, placed where the camera's
// way in crosses that wall, so the camera comes in through the door. Party walls close both sides. Inside:
// a window aisle along the glass, a front zone along the corridor wall (meeting rooms, offices, reception), a
// cross aisle in front of it, the open-plan zone between (with a second cross aisle on a deep floor), and the main
// aisle down the middle, from the door past the eye to the window, kept clear so the view out stays open.

/** World units: one floor (PITCH) stands for about 4 m. */
export const WALL_T = 0.03 // a wall's thickness (≈ 12 cm)
export const CORRIDOR = 0.45 // the corridor's depth between the street glass and the corridor wall (≈ 1.8 m)
export const FRONT_D = 1.25 // the front zone's depth (≈ 5 m: a meeting room)
export const LANE = 0.32 // an aisle's width (≈ 1.3 m)
export const WINDOW_LANE = 0.28 // the aisle along the window wall
const FACADE_IN = 0.06 // the room starts this far in from the facade's line (its columns and mullions)
const KEEP = 0.3 // half the eye's clear zone: nothing stands within about 1.2 m of the viewer
const MID_AFTER = 1.4 // a second cross aisle this far in front of the eye (≈ 5.6 m), on a deep floor
const MID_DEPTH = 3 // the open-plan zone's depth from which it gets one
/** The entrance: a 1 m door 2.2 m high, and a glass sidelight next to it where there is room. */
export const DOOR = { w: 0.25, h: 0.55, side: 0.22, frame: 0.014 }

export type RoomPlan = {
  foot: Footprint
  inner: Rect // inside the walls, up to the corridor wall
  corridorZ: number // the corridor wall's centre line
  door: { x: number } // the entrance door's centre
  eye: { x: number; z: number }
  keep: Rect // the eye's clear zone
  main: Rect // the main aisle down the middle
  entry: Rect // from the door to the eye (the camera's way in)
  window: Rect // along the window wall
  cross: Rect // in front of the front zone
  mid: Rect | null // the second cross aisle, on a deep floor
  lanes: Rect[] // every aisle above, kept clear of furniture
  front: Rect // the front zone
  desks: Rect // the open-plan zone
}

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi))

const strip = (inner: Rect, z0: number, z1: number): Rect => ({ x0: inner.x0, x1: inner.x1, z0, z1 })

/** The aisles: down the middle, the way in, along the window, in front of the front zone and (deep floors) mid-floor. */
/** A room narrower than this keeps no aisle from the eye to the window: the space behind the viewer is used. */
const NARROW = 1

function aisles(inner: Rect, doorX: number, eye: { x: number; z: number }) {
  const half = LANE / 2
  const front = strip(inner, inner.z1 - FRONT_D, inner.z1)
  const cross = strip(inner, front.z0 - LANE, front.z0)
  const window = strip(inner, inner.z0, inner.z0 + WINDOW_LANE)
  const desks = strip(inner, window.z1, cross.z0)
  const midZ = eye.z + MID_AFTER
  const mid = rectD(desks) > MID_DEPTH ? strip(inner, midZ - half, midZ + half) : null
  return {
    main: { x0: eye.x - half, x1: eye.x + half, z0: rectW(inner) < NARROW ? eye.z : inner.z0, z1: inner.z1 },
    entry: { x0: Math.min(doorX, eye.x) - half, x1: Math.max(doorX, eye.x) + half, z0: eye.z, z1: inner.z1 },
    window, cross, mid, front, desks,
  }
}

export function roomPlan(foot: Footprint): RoomPlan {
  const corridorZ = foot.z1 - CORRIDOR
  const inner: Rect = { x0: foot.x0 + WALL_T, x1: foot.x1 - WALL_T, z0: foot.z0 + FACADE_IN, z1: corridorZ - WALL_T / 2 }
  const at = interiorLook(foot).eye
  const eye = { x: at[0], z: at[2] }
  const margin = DOOR.w / 2 + DOOR.frame
  const doorX = rectW(inner) > 1 ? clamp(entryX(foot, corridorZ), inner.x0 + margin, inner.x1 - margin) : clamp(eye.x, inner.x0 + margin, inner.x1 - margin)
  const a = aisles(inner, doorX, eye)
  const lanes = [a.main, a.entry, a.window, a.cross, ...(a.mid ? [a.mid] : [])]
  return { foot, inner, corridorZ, door: { x: doorX }, eye, keep: rectAt(eye.x, eye.z, 2 * KEEP, 2 * KEEP), ...a, lanes }
}
