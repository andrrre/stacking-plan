import { describe, it, expect } from 'vitest'
import { PerspectiveCamera } from 'three'
import { PAN_MS, PAN_TURN, type Look } from '../tourCamera'
import { TourRig } from './tourRig'

const look: Look = { eye: [0, 7.8, -1.6], yaw: 180, pitch: -5 }

describe('TourRig: the look inside', () => {
  it('the pan turns the look once all the way round and stays turned when it is done', () => {
    const rig = new TourRig()
    const camera = new PerspectiveCamera()
    rig.stand(look, 0)
    expect(rig.step(camera, PAN_MS / 2)).toBe(true)
    expect(rig.yaw).toBeCloseTo(PAN_TURN / 2, 6)
    expect(rig.step(camera, PAN_MS + 10)).toBe(false)
    expect(rig.yaw).toBeCloseTo(PAN_TURN, 6)
    expect(rig.panning).toBe(false)
    rig.step(camera, PAN_MS + 500)
    expect(rig.yaw).toBeCloseTo(PAN_TURN, 6) // no jump back
  })

  it('a drag takes over from wherever the pan was and turns on past a full turn, either way', () => {
    const rig = new TourRig()
    const camera = new PerspectiveCamera()
    rig.stand(look, 0)
    rig.step(camera, PAN_MS / 2)
    expect(rig.grab(100, 100, PAN_MS / 2)).toBe(true)
    expect(rig.panning).toBe(false)
    rig.dragTo(100 + 1800, 100) // 0.2° a px: one more full turn
    rig.step(camera, PAN_MS)
    expect(rig.yaw).toBeCloseTo(PAN_TURN / 2 + 360, 6)
    rig.dragTo(100 - 3600, 100)
    rig.step(camera, PAN_MS)
    expect(rig.yaw).toBeCloseTo(PAN_TURN / 2 + 360 - 1080, 6) // back 5400 px: three turns the other way
    rig.release()
  })

  it('under reduced motion (no pan) it stands at the stop\'s own view, and up and down stay within limits', () => {
    const rig = new TourRig()
    const camera = new PerspectiveCamera()
    rig.stand(look, null)
    expect(rig.step(camera, 5000)).toBe(false)
    expect(rig.yaw).toBe(0)
    rig.grab(0, 0, 5000)
    rig.dragTo(0, 10_000)
    rig.step(camera, 5000)
    const dir = camera.getWorldDirection(camera.position.clone())
    expect(Math.asin(dir.y) * (180 / Math.PI)).toBeLessThanOrEqual(35 + 1e-6)
  })
})
