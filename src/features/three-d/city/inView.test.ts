import { describe, expect, it } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../../data'
import { buildStackModel } from '../../stack/suiteVisual'
import { DEFAULT_VIEW, FOV_Y, framePose, insetsFor, viewShift, type Vec3 } from '../camera'
import { buildingLayout, buildingSite } from '../layout3d'
import { cityPlan } from './plan'
import { cityTraffic, poseAt } from './traffic'

// People must be there to see in the default view of every bundled building, without hunting: the real default
// camera pose, the stage size at a 1440×900 window, and the people projected over a sample of times.

const TODAY = '2026-11-15'
const STAGE = { width: 790, height: 550 } // the 3D stage's canvas in a 1440×900 window
const HEAD = 0.3 // a person counts as seen when their head is in view and not behind the building

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l] }

/** A point's place on the canvas (px), as the rig's camera with its view offset draws it; null behind the camera. */
function projector(eye: Vec3, target: Vec3) {
  const f = norm(sub(target, eye))
  const right = norm(cross(f, [0, 1, 0]))
  const up = cross(right, f)
  const tanV = Math.tan((FOV_Y / 2) * (Math.PI / 180))
  const shift = viewShift(insetsFor(STAGE.width, STAGE.height))
  return (p: Vec3) => {
    const r = sub(p, eye)
    const depth = dot(r, f)
    if (depth <= 0) return null
    const nx = dot(r, right) / depth / (tanV * (STAGE.width / STAGE.height))
    const ny = dot(r, up) / depth / tanV
    return { x: ((nx + 1) / 2) * STAGE.width - shift.x, y: ((1 - ny) / 2) * STAGE.height - shift.y }
  }
}

/** Whether the segment p→q passes through the box (slab test). */
function hits(p: Vec3, q: Vec3, min: Vec3, max: Vec3): boolean {
  let t0 = 0
  let t1 = 1
  for (const i of [0, 1, 2] as const) {
    const d = q[i] - p[i]
    if (Math.abs(d) < 1e-12) {
      if (p[i] < min[i] || p[i] > max[i]) return false
      continue
    }
    const [a, b] = [(min[i] - p[i]) / d, (max[i] - p[i]) / d]
    t0 = Math.max(t0, Math.min(a, b))
    t1 = Math.min(t1, Math.max(a, b))
    if (t0 > t1) return false
  }
  return true
}

describe('people in the default view', () => {
  for (const building of BUNDLED_BUILDINGS) {
    it(`${building.id}: at least 8 people in frame at any time, at least 3 of them in front of the building`, () => {
      const model = buildStackModel({
        building, asOf: TODAY, today: TODAY, mode: 'availability', matches: [], highlightIds: null, modifiedIds: new Set(), selectedSuiteId: null,
      })
      const site = buildingSite(model)
      const bounds = buildingLayout(model, 0).bounds
      const pose = framePose(bounds, DEFAULT_VIEW, STAGE, insetsFor(STAGE.width, STAGE.height))
      const project = projector(pose.position, pose.target)
      const people = cityTraffic(building.id, cityPlan(building.id, site)).people
      const fewest = { all: Infinity, front: Infinity }
      for (let t = 0; t < 600; t += 3.7) {
        const seen = people.map((m) => poseAt(m, t)).filter((p) => {
          const head: Vec3 = [p.x, HEAD, p.z]
          const at = project(head)
          const inFrame = at !== null && at.x > 0 && at.x < STAGE.width && at.y > 0 && at.y < STAGE.height
          return p.scale > 0.5 && inFrame && !hits(pose.position, head, bounds.min, bounds.max)
        })
        fewest.all = Math.min(fewest.all, seen.length)
        fewest.front = Math.min(fewest.front, seen.filter((p) => p.z > site.halfD).length)
      }
      expect(fewest.all).toBeGreaterThanOrEqual(8)
      expect(fewest.front).toBeGreaterThanOrEqual(3)
    })
  }
})
