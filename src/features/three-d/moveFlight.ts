import type { Box } from './layout3d'

// The previewed move's flight: the tenant's block leaves its old suite, crosses in front of the building and
// slides into its new suite. Pure: the scene asks where the block is at a given progress and draws it there.

export const FLIGHT_MS = 1600
export const FLIGHT_OUT = 9 // how far forward of its slot a block travels: more than a suite's depth (8.2), so it clears the facade

/** The share of the flight spent coming out of the facade (and, at the end, going back in). */
const EDGE = 0.25

const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1)

/** A box's own fields (a SuiteBox carries more). */
const pick = (b: Box): Box => ({ x: b.x, y: b.y, z: b.z, w: b.w, h: b.h, d: b.d })

/** The flying block at progress k in [0, 1]: out of the facade, across to the destination, in. */
export function flightAt(from: Box, to: Box, k: number): Box {
  const t = clamp01(k)
  const out = Math.max(from.z, to.z) + FLIGHT_OUT
  if (t <= EDGE) return { ...pick(from), z: lerp(from.z, out, t / EDGE) }
  if (t >= 1 - EDGE) return { ...pick(to), z: lerp(out, to.z, (t - (1 - EDGE)) / EDGE) }
  const e = (t - EDGE) / (1 - 2 * EDGE)
  return {
    x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e), z: out, w: lerp(from.w, to.w, e), h: lerp(from.h, to.h, e), d: lerp(from.d, to.d, e),
  }
}
