import { PAVE, hashSeed, seededRandom, type CityPlan, type Road } from './plan'

// Cars in lanes and people on the pavements of the sketched city. Pure: where each one is is a function of
// time alone (`poseAt`), so nothing accumulates frame to frame and any moment can be drawn or tested. Every
// mover runs a long straight route and starts again from its beginning; it shrinks to nothing over the last
// and first RAMP units, so the jump back is never seen.

export type Route = { from: [number, number]; to: [number, number] } // plan points (x, z)
/**
 * `offset` is where on its route it is at time 0 (0..1); `speed` in world units a second; `tone` and `tone2`
 * pick colours (a car's body; a person's top and trousers); `size` scales a person (1 for cars).
 */
export type Mover = { route: Route; offset: number; speed: number; tone: number; tone2: number; size: number }
export type Pose = { x: number; z: number; heading: number; scale: number } // heading: radians about y, 0 = towards +z

/** Car body and cabin sizes (world units: one floor ≈ 4 m); `top` is its highest point. */
export const CAR = { length: 1.1, width: 0.46, body: 0.2, cabin: 0.14, top: 0.36 }
export const RAMP = 2.5 // world units over which a mover grows in at the start of its route and shrinks out at the end

export type Traffic = { cars: Mover[]; people: Mover[] }

export const routeLength = (r: Route) => Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1])

const mod = (a: number, n: number) => ((a % n) + n) % n

export function poseAt(m: Mover, t: number): Pose {
  const L = routeLength(m.route)
  const s = mod(m.offset * L + m.speed * t, L)
  const [ax, az] = m.route.from
  const dx = (m.route.to[0] - ax) / L
  const dz = (m.route.to[1] - az) / L
  return { x: ax + dx * s, z: az + dz * s, heading: Math.atan2(dx, dz), scale: Math.min(Math.max(Math.min(s, L - s) / RAMP, 0), 1) }
}

/** The line `off` from the road's centre, run one way or the other along it. */
function along(r: Road, off: number, forward: boolean): Route {
  const [a, b] = forward ? [r.from, r.to] : [r.to, r.from]
  return r.axis === 'x' ? { from: [a, r.at + off], to: [b, r.at + off] } : { from: [r.at + off, a], to: [r.at + off, b] }
}

/** Both lanes of every road with traffic (one each side of the centre line), keeping to the right. */
function lanes(roads: readonly Road[]): Route[] {
  return roads.filter((r) => r.traffic).flatMap((r) => [along(r, r.width / 4, r.axis === 'z'), along(r, -r.width / 4, r.axis !== 'z')])
}

/** Both pavements of every road with traffic. */
function walks(roads: readonly Road[]): Route[] {
  const off = (r: Road) => r.width / 2 + PAVE / 2
  return roads.filter((r) => r.traffic).flatMap((r) => [along(r, off(r), true), along(r, -off(r), false)])
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

/** Two people per pavement, each at their own pace and height (±10%), a few of them dropped at random. */
function peopleOn(rand: () => number, routes: readonly Route[]): Mover[] {
  const person = (route: Route): Mover => ({
    route, speed: 0.2 + rand() * 0.14, offset: rand(), tone: Math.floor(rand() * 4), tone2: Math.floor(rand() * 3), size: 0.9 + rand() * 0.2,
  })
  const all = routes.flatMap((route) => [person(route), person(route)])
  const drop = Math.floor(rand() * 3)
  return all.filter((_, i) => i % 5 !== 4 || i / 5 >= drop)
}

/** The cars and people for a city plan, seeded by the building id (a different stream from the plan's). */
export function cityTraffic(buildingId: string, plan: CityPlan): Traffic {
  const rand = seededRandom(hashSeed(`${buildingId}:traffic`))
  return { cars: carsOn(rand, lanes(plan.roads)), people: peopleOn(rand, walks(plan.roads)) }
}
