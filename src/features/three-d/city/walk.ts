import { FIGURE } from './figure'
import { lapLength, poseAt, routeLength, type Mover, type Pose } from './traffic'

// A pedestrian's walk: where the body parts are at time t. Pure, like poseAt (and built on it). The legs swing
// from the hip opposite each other and the arms opposite the legs; the phase follows the distance walked, one
// cycle per two steps of the legs' own length, so the feet do not slide. Both legs make the same angle with
// the vertical, so the hip drops exactly as much as the swung legs rise and both feet stay on the ground.

export { FIGURE }

/** `legs` and `arms` are [left, right] swing angles (radians, + = forward); `bob` the hip's drop; `feet` their heights. */
export type Figure = Pose & { height: number; legs: [number, number]; arms: [number, number]; bob: number; feet: [number, number] }

/** One walking cycle's length (two steps), set so the route holds a whole number of them. */
export function strideOf(m: Mover): number {
  const natural = 4 * FIGURE.leg * FIGURE.height * m.size * Math.sin(FIGURE.swing)
  const L = routeLength(m.route)
  return L / Math.max(Math.round(L / natural), 1)
}

export function figureAt(m: Mover, t: number): Figure {
  const pose = poseAt(m, t)
  const height = FIGURE.height * m.size
  const leg = FIGURE.leg * height
  const phase = (2 * Math.PI * (m.offset * lapLength(m.route) + m.speed * t)) / strideOf(m)
  const a = m.speed === 0 ? 0 : FIGURE.swing * Math.sin(phase) // someone standing stands straight
  const arm = -a * FIGURE.armSwing
  const bob = a === 0 ? 0 : leg * (Math.cos(a) - 1)
  const foot = leg + bob - leg * Math.cos(a)
  return { ...pose, height, legs: [a, -a], arms: [arm, -arm], bob, feet: [foot, foot] }
}
