import { describe, it, expect } from 'vitest'
import {
  DEFAULT_VIEW, FLOOR_VIEW, FOV_Y, NO_OFFSET, floorInsets, WIDE_STAGE, applyOffset, centre, corners, fitDistance, framePose, insetsFor, offsetBetween, viewDirection, viewOf, viewShift, zoomedIn,
  type Vec3,
} from './camera'
import type { Bounds } from './layout3d'

const BOX: Bounds = { min: [-9, 0, -2], max: [9, 12, 2.3] }
const rad = (d: number) => (d * Math.PI) / 180

/** Projects `p` for a camera at `pos` looking at `target`; returns normalised device coords. */
function ndc(p: Vec3, pos: Vec3, target: Vec3, aspect: number): { x: number; y: number } {
  const f = [target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]]
  const fl = Math.hypot(f[0] ?? 0, f[1] ?? 0, f[2] ?? 0)
  const fw: Vec3 = [(f[0] ?? 0) / fl, (f[1] ?? 0) / fl, (f[2] ?? 0) / fl]
  const r0: Vec3 = [-fw[2], 0, fw[0]]
  const rl = Math.hypot(...r0)
  const r: Vec3 = [r0[0] / rl, 0, r0[2] / rl]
  const u: Vec3 = [r[1] * fw[2] - r[2] * fw[1], r[2] * fw[0] - r[0] * fw[2], r[0] * fw[1] - r[1] * fw[0]]
  const o: Vec3 = [p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]]
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const depth = dot(o, fw)
  const t = Math.tan(rad(FOV_Y / 2))
  return { x: dot(o, r) / depth / (t * aspect), y: dot(o, u) / depth / t }
}

describe('viewDirection', () => {
  it('points from the front, to the right and above for the default view', () => {
    const [x, y, z] = viewDirection(DEFAULT_VIEW)
    expect(x).toBeGreaterThan(0)
    expect(y).toBeGreaterThan(0)
    expect(z).toBeGreaterThan(x)
    expect(Math.hypot(x, y, z)).toBeCloseTo(1)
  })
})

describe('framePose', () => {
  it('fits every corner of the building inside the canvas, less the insets', () => {
    for (const size of [{ width: 775, height: 550 }, { width: 615, height: 300 }, { width: 400, height: 900 }]) {
      const insets = insetsFor(size.width, size.height)
      const pose = framePose(BOX, DEFAULT_VIEW, size, insets)
      const shift = viewShift(insets)
      const aspect = size.width / size.height
      for (const c of corners(BOX)) {
        const p = ndc(c, pose.position, pose.target, aspect)
        const px = ((p.x + 1) / 2) * size.width - shift.x
        const py = ((1 - p.y) / 2) * size.height - shift.y
        expect(px, JSON.stringify(size)).toBeGreaterThanOrEqual(insets.left - 0.5)
        expect(px).toBeLessThanOrEqual(size.width - insets.right + 0.5)
        expect(py).toBeGreaterThanOrEqual(insets.top - 0.5)
        expect(py).toBeLessThanOrEqual(size.height - insets.bottom + 0.5)
      }
    }
  })

  it('touches the frame on at least one side (no wasted zoom)', () => {
    const size = { width: 775, height: 550 }
    const insets = insetsFor(size.width, size.height)
    const pose = framePose(BOX, DEFAULT_VIEW, size, insets)
    const pts = corners(BOX).map((c) => ndc(c, pose.position, pose.target, size.width / size.height))
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const spanX = (Math.max(...xs) - Math.min(...xs)) / 2 * size.width
    const spanY = (Math.max(...ys) - Math.min(...ys)) / 2 * size.height
    const fillX = spanX / (size.width - insets.left - insets.right)
    const fillY = spanY / (size.height - insets.top - insets.bottom)
    expect(Math.max(fillX, fillY)).toBeGreaterThan(0.98)
  })

  it('moves further away for a taller building', () => {
    const size = { width: 775, height: 550 }
    const tall: Bounds = { min: BOX.min, max: [9, 25, 2.3] }
    expect(framePose(tall, DEFAULT_VIEW, size, insetsFor(775, 550)).distance)
      .toBeGreaterThan(framePose(BOX, DEFAULT_VIEW, size, insetsFor(775, 550)).distance)
  })

  it('fitDistance is zero for points at the target', () => {
    expect(fitDistance([centre(BOX)], centre(BOX), [0, 0, 1], 1, 1)).toBe(0)
  })
})

describe('insetsFor', () => {
  it('keeps the top clear on a narrow stage and the right side clear on a wide one', () => {
    expect(insetsFor(775, 550).top).toBeGreaterThan(insetsFor(775, 550).right)
    expect(insetsFor(550 * WIDE_STAGE, 550).right).toBeGreaterThan(insetsFor(550 * WIDE_STAGE, 550).top)
    expect(viewShift({ top: 40, right: 10, bottom: 10, left: 30 })).toEqual({ x: -10, y: -15 })
  })
})

describe('zoomedIn', () => {
  it('an orbit (same distance) is judged where it began: from the framing it glides back, even if the new angle needs more room', () => {
    expect(zoomedIn({ d: 50, ratio: 1 }, { d: 50, ratio: 0.8 })).toBe(false)
    expect(zoomedIn({ d: 20, ratio: 0.4 }, { d: 20, ratio: 0.35 })).toBe(true) // zoomed in before: orbiting keeps it
  })

  it('a zoom (distance changed) is judged where it ended', () => {
    expect(zoomedIn({ d: 50, ratio: 1 }, { d: 40, ratio: 0.8 })).toBe(true)
    expect(zoomedIn({ d: 40, ratio: 0.8 }, { d: 60, ratio: 1.2 })).toBe(false)
  })

  it('viewOf inverts viewDirection', () => {
    const v = viewOf(viewDirection({ azimuth: -30, elevation: 20 }))
    expect(v.azimuth).toBeCloseTo(-30)
    expect(v.elevation).toBeCloseTo(20)
  })
})

describe('camera offsets (button turns and zooms kept across reframes)', () => {
  const frame = { position: [10, 20, 60] as Vec3, target: [0, 5, 0] as Vec3, distance: Math.hypot(10, 15, 60) }
  const near = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i] ?? NaN, 6))

  it('no change is no offset', () => {
    expect(offsetBetween(frame, frame)).toEqual(NO_OFFSET)
    const back = applyOffset(frame, NO_OFFSET)
    near(back.position, frame.position)
    near(back.target, frame.target)
  })

  it('re-applying the measured offset to the same framing lands exactly where the camera was', () => {
    const now = { position: [-30, 30, 25] as Vec3, target: [2, 6, -1] as Vec3 }
    const o = offsetBetween(frame, now)
    const back = applyOffset(frame, o)
    near(back.position, now.position)
    near(back.target, now.target)
  })

  it('measures what the camera did, not what was asked: a clamped turn is stored as clamped', () => {
    const dir = viewDirection({ azimuth: 50, elevation: 14.5 }) // stopped at the azimuth limit
    const now = { position: [dir[0] * 80, 5 + dir[1] * 80, dir[2] * 80] as Vec3, target: [0, 5, 0] as Vec3 }
    const base = viewDirection({ azimuth: 16, elevation: 14.5 })
    const f = { position: [base[0] * 80, 5 + base[1] * 80, base[2] * 80] as Vec3, target: [0, 5, 0] as Vec3, distance: 80 }
    const o = offsetBetween(f, now)
    expect(o.azimuth).toBeCloseTo(34)
    expect(o.elevation).toBeCloseTo(0)
    expect(o.factor).toBeCloseTo(1)
  })
})

describe('floor view framing', () => {
  const PLATE: Bounds = { min: [-9.16, 4.3, -4.26], max: [9.16, 5.18, 4.26] }

  it('looks down onto the plate: its top face shows larger than its front face', () => {
    const size = { width: 1000, height: 640 }
    const pose = framePose(PLATE, FLOOR_VIEW, size, floorInsets(size.width, size.height))
    const at = (x: number, y: number, z: number) => ndc([x, y, z], pose.position, pose.target, size.width / size.height)
    const [x0, x1] = [PLATE.min[0], PLATE.max[0]]
    const [y0, y1] = [PLATE.min[1], PLATE.max[1]]
    const [z0, z1] = [PLATE.min[2], PLATE.max[2]]
    const topFace = at(x0, y1, z0).y - at(x0, y1, z1).y // back edge to front edge, on screen
    const frontFace = at(x0, y1, z1).y - at(x0, y0, z1).y
    expect(topFace).toBeGreaterThan(3 * frontFace)
    expect(at(x1, y1, z1).x).toBeGreaterThan(at(x0, y1, z1).x) // seen from the front, not the side or back
  })

  it('frames the whole plate inside the area the slider and controls leave', () => {
    const size = { width: 1000, height: 640 }
    const insets = floorInsets(size.width, size.height)
    const pose = framePose(PLATE, FLOOR_VIEW, size, insets)
    const shift = viewShift(insets)
    const xs: number[] = []
    for (const c of corners(PLATE)) {
      const p = ndc(c, pose.position, pose.target, size.width / size.height)
      const px = ((p.x + 1) / 2) * size.width - shift.x
      const py = ((1 - p.y) / 2) * size.height - shift.y
      xs.push(px)
      expect(px).toBeGreaterThanOrEqual(insets.left - 0.5)
      expect(px).toBeLessThanOrEqual(size.width - insets.right + 0.5)
      expect(py).toBeGreaterThanOrEqual(insets.top - 0.5)
      expect(py).toBeLessThanOrEqual(size.height - insets.bottom + 0.5)
    }
    // The plate fills most of the width left to it.
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.9 * (size.width - insets.left - insets.right))
  })
})
