import { DEPTH, LIFT, PLINTH_H, SLAB_T } from '../layout3d'
import { FIGURE } from './figure'
import { PAVE, ROAD, type CityPlan, type Rect } from './plan'
import type { Mover, Point, Route } from './traffic'

// The people of the sketched city, placed where the default camera looks: two rings of walkers round the
// pavement of our own block (one each way), short stretches of pavement across the front and side roads
// walked back and forth, a few pairs, and two or three people standing by the entrance or a corner. Every
// route stays on a pavement and never crosses a road with cars. Pure and seeded, like the plan.

type Rand = () => number

const FACADE = DEPTH / 2 + LIFT // the most a suite's front face stands forward
const LOWEST = PLINTH_H + SLAB_T // the bottom of the lowest facade label
const TAN_MIN_ELEVATION = Math.tan((3 * Math.PI) / 180)

/**
 * The tallest a person on `route` may be so that nothing they could stand on in front of the facade reaches
 * the sightline to the lowest labels from the lowest camera (3°). A route behind the facade has no limit; one
 * that reaches the facade plane is held to the label's own bottom.
 */
export function heightCap(route: Route): number {
  const zs = route.points.map((p) => p[1])
  if (Math.max(...zs) <= FACADE) return Infinity
  const nearest = Math.min(...zs)
  return nearest <= FACADE ? LOWEST : LOWEST + (nearest - FACADE) * TAN_MIN_ELEVATION
}

/** A rectangle's corners in order (x0,z1 first), clockwise or not as seen from above. */
const ring = (r: Rect, reverse: boolean): Route => {
  const pts: Point[] = [[r.x0, r.z1], [r.x1, r.z1], [r.x1, r.z0], [r.x0, r.z0]]
  return { kind: 'loop', points: reverse ? pts.reverse() : pts }
}
const inset = (r: Rect, d: number): Rect => ({ x0: r.x0 + d, x1: r.x1 - d, z0: r.z0 + d, z1: r.z1 - d })
const across = (z: number, x0: number, x1: number): Route => ({ kind: 'bounce', points: [[x0, z], [x1, z]] })
const down = (x: number, z0: number, z1: number): Route => ({ kind: 'bounce', points: [[x, z0], [x, z1]] })

function person(rand: Rand, route: Route, speed: number, offset: number): Mover {
  const height = Math.min(FIGURE.height * (0.9 + 0.2 * rand()), heightCap(route) - 0.012)
  return { route, speed, offset: ((offset % 1) + 1) % 1, tone: Math.floor(rand() * 4), tone2: Math.floor(rand() * 3), size: height / FIGURE.height }
}

/** `n` people evenly spread round a loop at one shared pace (so they never walk into each other), plus one pair. */
function walkers(rand: Rand, route: Route, n: number, length: number): Mover[] {
  const speed = 0.22 + rand() * 0.1
  const start = rand()
  const crowd = Array.from({ length: n }, (_, k) => person(rand, route, speed, start + (k + rand() * 0.4) / n))
  const lead = crowd[Math.floor(rand() * n)]
  return lead ? [...crowd, person(rand, route, speed, lead.offset + 0.55 / length)] : crowd
}

/** People pacing a short stretch, each on their own line across the pavement so they pass beside each other. */
function pacers(rand: Rand, line: (f: number) => Route, n: number): Mover[] {
  return Array.from({ length: n }, (_, k) => person(rand, line((k + 1) / (n + 1)), 0.2 + rand() * 0.12, rand()))
}

/** Someone standing on the line `z`, at `x`, facing along the pavement. */
const stander = (rand: Rand, x: number, z: number): Mover => person(rand, { kind: 'loop', points: [[x - 0.5, z], [x + 0.5, z]] }, 0, 0.25)

export function peopleOn(rand: Rand, plan: CityPlan): Mover[] {
  const lot = plan.lot
  const perimeter = 2 * (lot.x1 - lot.x0 + lot.z1 - lot.z0)
  const near = [0.3, 0.7].flatMap((f, i) => walkers(rand, ring(inset(lot, f * PAVE), i === 1), 12, perimeter))
  const x = { x0: lot.x0 + 0.5, x1: lot.x1 - 0.5 }
  const front = pacers(rand, (f) => across(lot.z1 + ROAD + f * PAVE, x.x0, x.x1), 4)
  const frontPair = front[0] ? [{ ...front[0], offset: (front[0].offset + 0.6 / (2 * (x.x1 - x.x0))) % 1, tone: (front[0].tone + 1) % 4 }] : []
  const sides = [1, -1].flatMap((side) => pacers(rand, (f) => down(side * (lot.x1 + ROAD + f * PAVE), lot.z0 + 0.5, lot.z1 - 0.5), 3))
  const back = pacers(rand, (f) => across(lot.z0 - ROAD - f * PAVE, x.x0, x.x1), 3)
  const waiting = [
    stander(rand, (rand() - 0.5) * 4, lot.z1 - 0.5 * PAVE), // by the entrance
    stander(rand, lot.x1 - 1.2, lot.z1 - 0.5 * PAVE), // at the front corner
    ...(rand() < 0.5 ? [stander(rand, lot.x0 + 1.2, lot.z1 + ROAD + 0.5 * PAVE)] : []), // across the road
  ]
  return [...near, ...front, ...frontPair, ...sides, ...back, ...waiting]
}
