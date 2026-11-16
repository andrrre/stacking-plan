import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { buildStackModel } from '../stack/suiteVisual'
import { DEFAULT_VIEW, FOV_Y, framePose, insetsFor, viewShift } from './camera'
import { fitLabel, labelContent, type Pt2 } from './labels3d'
import { buildingLayout, labelFace, suiteRect, type Corner } from './layout3d'

// The handoff's two-line labels at the resting view: the real default pose, framed the way the camera rig frames
// it, projected the way the scene's camera draws it, with each front face fitted as the overlay fits it.

const TODAY = '2026-11-15'
const STAGE = { width: 1126, height: 487 } // the 3D canvas in a 1440×900 window, left drawer open, right closed

function fits(id: string) {
  const building = BUNDLED_BUILDINGS.find((b) => b.id === id)
  if (!building) throw new Error(`no building ${id}`)
  const model = buildStackModel({
    building, asOf: TODAY, today: TODAY, mode: 'availability', matches: [], highlightIds: null, modifiedIds: new Set(), selectedSuiteId: null,
  })
  const layout = buildingLayout(model, 0)
  const insets = insetsFor(STAGE.width, STAGE.height)
  const pose = framePose(layout.bounds, DEFAULT_VIEW, STAGE, insets)
  const camera = new PerspectiveCamera(FOV_Y, STAGE.width / STAGE.height, 0.5, 2000)
  const shift = viewShift(insets)
  camera.setViewOffset(STAGE.width, STAGE.height, shift.x, shift.y, STAGE.width, STAGE.height)
  camera.position.set(...pose.position)
  camera.lookAt(new Vector3(...pose.target))
  camera.updateMatrixWorld()
  const v = new Vector3()
  const project = (c: Corner): Pt2 => {
    v.set(...c).project(camera)
    return { x: ((v.x + 1) / 2) * STAGE.width, y: ((1 - v.y) / 2) * STAGE.height }
  }
  const visuals = new Map(model.floors.flatMap((f) => f.suites).map((s) => [s.suite.id, s]))
  return layout.suites.flatMap((b) => {
    const visual = visuals.get(b.id)
    if (!visual) return []
    const c = labelContent(visual)
    const quad = labelFace(suiteRect(b), false).map(project) as [Pt2, Pt2, Pt2, Pt2]
    return [{ number: c.number, compact: c.compact, parts: fitLabel(c, quad, false).parts }]
  })
}

describe('labels at the default view, 1440×900', () => {
  it('Ocean Drive Tower: every suite of 2,500 SF or more shows both lines, suite · SF over its tenant or status', () => {
    const all = fits('odt')
    const full = all.filter((f) => !f.compact)
    expect(full.length).toBe(25)
    expect(full.filter((f) => !f.parts.tenant).map((f) => f.number)).toEqual([])
    expect(full.every((f) => f.parts.number && f.parts.sf && f.parts.lines === 2)).toBe(true)
  })

  it('a compact suite keeps its number alone', () => {
    for (const f of fits('odt').filter((x) => x.compact)) expect(f.parts, f.number).toMatchObject({ sf: false, tenant: false })
  })

  it('a 30-floor tower is too small at default zoom for line 2, and degrades to line 1 rather than overflowing', () => {
    const shown = fits('bsp').filter((f) => f.parts.lines > 0)
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.every((f) => !f.parts.tenant)).toBe(true)
  })
})
