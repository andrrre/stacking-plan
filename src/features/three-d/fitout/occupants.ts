import { poseAt, type Mover, type Point, type Route } from '../city/traffic'
import { bayMiddle, APPROACH } from '../tourCamera'
import { rectW, type Rect } from './rect'
import type { RoomPlan } from './roomPlan'

// The people in a suite on the tour: abstract figures (the city's pedestrians, no faces) walking up and down the
// aisles, and a couple standing at the kitchenette. Pure and seeded: a mover's place is a function of time alone
// (poseAt), so nothing accumulates frame to frame. Nobody walks the main aisle: that is the viewer's way in and
// their place, and every walker starts clear of it, so the camera never comes in through someone.

/** A figure's reach from its centre line in plan (shoulders and swinging arms, ≈ 0.3 m). */
export const PERSON_R = 0.075
/** At most this many people, however big the suite. */
export const MAX_PEOPLE = 12
const SF_PER_PERSON = 1000
const END = 0.2 // a walk turns this far short of the room's side walls
const MIN_WALK = 0.3 // a stretch of aisle shorter than this is not walked
const CLEAR_START = 0.3 // walkers start at least this far from the camera's way in
const TRIES = 12

/** Someone standing: where, and which way they face (radians about y, 0 = towards +z). */
export type Spot = { x: number; z: number; heading: number }

const midZ = (r: Rect) => (r.z0 + r.z1) / 2

/** The aisles people walk: along the window, mid-floor and in front of the meeting rooms, end to end. */
function walks(p: RoomPlan): Route[] {
  const strips = [p.window, ...(p.mid ? [p.mid] : []), p.cross].filter((r) => rectW(r) - 2 * END >= MIN_WALK)
  return strips.map((r) => ({ kind: 'bounce', points: [[r.x0 + END, midZ(r)], [r.x1 - END, midZ(r)]] }))
}

function toSegment(x: number, z: number, a: Point, b: Point): number {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]]
  const k = Math.min(Math.max(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0), 1)
  return Math.hypot(x - (a[0] + dx * k), z - (a[1] + dz * k))
}

/** A start along the route clear of the camera's way in (from the street to the eye), from the seeded stream. */
function clearOffset(route: Route, speed: number, p: RoomPlan, rand: () => number): number {
  const from: Point = [bayMiddle(p.foot), p.foot.z1 + APPROACH]
  const eye: Point = [p.eye.x, p.eye.z]
  const base = { route, speed, tone: 0, tone2: 0, size: 1 }
  const tries = Array.from({ length: TRIES }, () => rand())
  const ok = tries.find((offset) => {
    const at = poseAt({ ...base, offset }, 0)
    return toSegment(at.x, at.z, from, eye) > CLEAR_START
  })
  return ok ?? (tries[0] ?? 0) // a route always has stretches clear of a single crossing; the fallback is never reached in practice
}

const person = (route: Route, offset: number, speed: number, rand: () => number): Mover =>
  ({ route, offset, speed, tone: Math.floor(rand() * 4), tone2: Math.floor(rand() * 3), size: 0.92 + rand() * 0.14 })

/** A figure standing still at a spot, facing its way (a route of a hair's length points it). */
function stander(s: Spot, rand: () => number): Mover {
  const route: Route = { kind: 'bounce', points: [[s.x, s.z], [s.x + Math.sin(s.heading) * 1e-3, s.z + Math.cos(s.heading) * 1e-3]] }
  return person(route, 0, 0, rand)
}

/** How many people a suite of `sf` square feet holds on the tour (at least two, at most MAX_PEOPLE). */
export const peopleFor = (sf: number): number =>
  (Number.isFinite(sf) ? Math.min(Math.max(Math.round(sf / SF_PER_PERSON), 2), MAX_PEOPLE) : 2)

/** Someone at the window, looking out: where a room too small to walk in puts its one person. */
const atWindow = (p: RoomPlan): Spot => ({ x: (p.window.x0 + p.window.x1) / 2, z: midZ(p.window), heading: Math.PI })

export function occupants(p: RoomPlan, spots: readonly Spot[], sf: number, rand: () => number): Mover[] {
  const n = peopleFor(sf)
  const routes = walks(p)
  if (routes.length === 0) return (spots.length > 0 ? spots.slice(0, n) : [atWindow(p)]).map((s) => stander(s, rand))
  const standing = spots.slice(0, Math.min(2, n - 1)).map((s) => stander(s, rand))
  const walkers = Array.from({ length: n - standing.length }, (_, i) => {
    const route = routes[i % routes.length] ?? routes[0]
    const speed = 0.16 + rand() * 0.1
    return route ? [person(route, clearOffset(route, speed, p, rand), speed, rand)] : []
  })
  return [...standing, ...walkers.flat()]
}
