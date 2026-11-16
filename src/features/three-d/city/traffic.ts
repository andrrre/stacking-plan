import { peopleOn } from './crowd'
import { hashSeed, seededRandom, type CityPlan, type Road } from './plan'

// Cars in lanes and people on the pavements of the sketched city. Pure: where each one is is a function of
// time alone (`poseAt`), so nothing accumulates frame to frame and any moment can be drawn or tested. A route
// is a polyline run one of three ways: `once` (a long straight road: start again from the beginning, shrinking
// to nothing over the last and first RAMP units so the jump back is never seen), `loop` (round a closed ring
// of pavement) or `bounce` (along a short stretch and back).

export type Point = [number, number] // plan (x, z)
export type Route = { points: Point[]; kind: 'once' | 'loop' | 'bounce' }
/**
 * `offset` is where on its lap it is at time 0 (0..1); `speed` in world units a second (0: standing); `tone`
 * and `tone2` pick colours (a car's body; a person's top and trousers); `size` scales a person (1 for cars).
 */
export type Mover = { route: Route; offset: number; speed: number; tone: number; tone2: number; size: number }
export type Pose = { x: number; z: number; heading: number; scale: number } // heading: radians about y, 0 = towards +z

/** Car body and cabin sizes (world units: one floor ≈ 4 m); `top` is its highest point. */
export const CAR = { length: 1.1, width: 0.46, body: 0.2, cabin: 0.14, top: 0.36 }
export const RAMP = 2.5 // world units over which a `once` mover grows in at the start of its route and shrinks out at the end

export type Traffic = { cars: Mover[]; people: Mover[] }

/** A route's legs, the closing one included for a loop. */
export function legsOf(r: Route): [Point, Point][] {
  const open = r.points.slice(1).map((b, i): [Point, Point] => [r.points[i] ?? b, b])
  const [first, last] = [r.points[0], r.points[r.points.length - 1]]
  return r.kind === 'loop' && first && last ? [...open, [last, first]] : open
}

const legLength = ([a, b]: [Point, Point]) => Math.hypot(b[0] - a[0], b[1] - a[1])
/** One way along the route (a loop: once round). */
export const routeLength = (r: Route) => legsOf(r).reduce((sum, l) => sum + legLength(l), 0)
/** The distance after which a mover is back where it started: there and back for a bounce. */
export const lapLength = (r: Route) => (r.kind === 'bounce' ? 2 : 1) * routeLength(r)

const mod = (a: number, n: number) => ((a % n) + n) % n

/** The point `s` along the route's legs, and the heading of the leg it is on. */
function along(r: Route, s: number): { x: number; z: number; heading: number } {
  const legs = legsOf(r)
  let left = s
  for (const [i, leg] of legs.entries()) {
    const L = legLength(leg)
    if (left <= L || i === legs.length - 1) {
      const [[ax, az], [bx, bz]] = leg
      const k = L === 0 ? 0 : Math.min(left / L, 1)
      return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, heading: Math.atan2(bx - ax, bz - az) }
    }
    left -= L
  }
  return { x: 0, z: 0, heading: 0 }
}

export function poseAt(m: Mover, t: number): Pose {
  const L = routeLength(m.route)
  const lap = lapLength(m.route)
  const d = mod(m.offset * lap + m.speed * t, lap)
  const back = m.route.kind === 'bounce' && d > L
  const s = back ? lap - d : d
  const p = along(m.route, s)
  const scale = m.route.kind === 'once' ? Math.min(Math.max(Math.min(s, L - s) / RAMP, 0), 1) : 1
  return { x: p.x, z: p.z, heading: back ? p.heading + Math.PI : p.heading, scale }
}

/** The line `off` from the road's centre, run one way or the other along it. */
function lane(r: Road, off: number, forward: boolean): Route {
  const [a, b] = forward ? [r.from, r.to] : [r.to, r.from]
  return { kind: 'once', points: r.axis === 'x' ? [[a, r.at + off], [b, r.at + off]] : [[r.at + off, a], [r.at + off, b]] }
}

/** Both lanes of every road with traffic (one each side of the centre line), keeping to the right. */
function lanes(roads: readonly Road[]): Route[] {
  return roads.filter((r) => r.traffic).flatMap((r) => [lane(r, r.width / 4, r.axis === 'z'), lane(r, -r.width / 4, r.axis !== 'z')])
}

/** One car per lane, a second on a few lanes at random; cars sharing a lane share its speed and keep apart. */
function carsOn(rand: () => number, routes: readonly Route[]): Mover[] {
  const extra = new Set([Math.floor(rand() * routes.length), Math.floor(rand() * routes.length)])
  return routes.flatMap((route, i) => {
    const speed = 1.1 + rand() * 0.6
    const n = extra.has(i) ? 2 : 1
    const start = rand()
    return Array.from({ length: n }, (_, k) => ({ route, speed, offset: (start + k / n) % 1, tone: Math.floor(rand() * 3), tone2: 0, size: 1 }))
  })
}

/** The cars and people for a city plan, seeded by the building id (a different stream from the plan's). */
export function cityTraffic(buildingId: string, plan: CityPlan): Traffic {
  const rand = seededRandom(hashSeed(`${buildingId}:traffic`))
  return { cars: carsOn(rand, lanes(plan.roads)), people: peopleOn(rand, plan) }
}
