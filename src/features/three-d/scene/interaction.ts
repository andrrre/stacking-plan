import { useEffect, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Raycaster, Vector2, type Camera, type Group, type Object3D } from 'three'
import { IDLE, captureLost, pointerCancel, pointerDown, pointerUp, type PointerInput } from '../gesture'
import type { Layout3D } from '../layout3d'
import type { ScreenPoint } from '../sceneTypes'
import type { SuiteVisual } from '../../stack/suiteVisual'
import { faceCentre, faceCorners, syncOverlay, type OverlayState } from './overlaySync'
import type { SuiteMaterials } from './suiteMaterials'
import { syncNeeded, type SyncMark } from './syncGate'

// Picking, hover, and the per-frame overlay sync. Whether a release is a click (not an orbit, a pinch or a
// cancelled touch) is decided by the pure gesture module.

const SETTLE_MS = 160

const suiteIdOf = (o: Object3D | undefined): string | null => {
  const id: unknown = o?.userData.suiteId
  return typeof id === 'string' ? id : null
}

function raycastAt(ray: Raycaster, camera: Camera, group: Group, x: number, y: number, w: number, h: number): string | null {
  ray.setFromCamera(new Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), camera)
  return suiteIdOf(ray.intersectObjects(group.children, false)[0]?.object)
}

/**
 * Each suite's label-face centre on the canvas, whether a click there would land on that suite, and the face's
 * corners ("x,y x,y x,y x,y": top-left, top-right, bottom-right, bottom-left), which tests check labels against.
 */
export function screenPoints(camera: Camera, width: number, height: number, layout: Layout3D, group: Group): Map<string, ScreenPoint> {
  const ray = new Raycaster()
  return new Map(layout.suites.map((b) => {
    const c = faceCentre({ camera, width, height, layout }, b)
    const face = faceCorners({ camera, width, height, layout }, b)
    return [b.id, { ...c, hit: raycastAt(ray, camera, group, c.x, c.y, width, height) === b.id, face }]
  }))
}

const samePoints = (a: ReadonlyMap<string, ScreenPoint>, b: ReadonlyMap<string, ScreenPoint>) =>
  a.size === b.size && [...a].every(([k, p]) => { const q = b.get(k); return q?.x === p.x && q.y === p.y && q.hit === p.hit && q.face === p.face })

type Sync = Omit<OverlayState, 'camera' | 'width' | 'height' | 'hoverId'> & {
  hover: RefObject<string | null>
  mats: SuiteMaterials
  group: RefObject<Group | null>
  onPoints: (p: ReadonlyMap<string, ScreenPoint>) => void
}

/** What the overlay follows: the camera's place and lens, the canvas size and the hovered suite. */
const viewKey = (camera: Camera, w: number, h: number, hover: string | null) =>
  `${camera.matrixWorld.elements.join()}|${camera.projectionMatrix.elements.join()}|${w}x${h}|${hover ?? ''}`

/**
 * Every frame: advance colour fades, move the overlay; once the camera has been still a moment, report screen
 * points. A frame in which neither the view nor the scene's inputs changed (the city's traffic redraws the
 * canvas while the building stands still) leaves the overlay and the pending report alone.
 */
export function useFrameSync(o: Sync): void {
  const invalidate = useThree((s) => s.invalidate)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPoints = useRef<ReadonlyMap<string, ScreenPoint>>(new Map())
  const synced = useRef<SyncMark>({ key: '', inputs: null })
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  useFrame((state) => {
    if (o.mats.step(performance.now())) invalidate()
    const { camera, size } = state
    camera.updateMatrixWorld()
    const key = viewKey(camera, size.width, size.height, o.hover.current)
    if (!syncNeeded(synced.current, key, o)) return
    synced.current = { key, inputs: o }
    syncOverlay({ ...o, camera, width: size.width, height: size.height, hoverId: o.hover.current })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const group = o.group.current
      if (!group) return
      const pts = screenPoints(camera, size.width, size.height, o.layout, group)
      if (samePoints(pts, lastPoints.current)) return
      lastPoints.current = pts
      o.onPoints(pts)
    }, SETTLE_MS)
  })
}

type Pick = {
  group: RefObject<Group | null>
  hover: RefObject<string | null>
  mats: SuiteMaterials
  tooltip: RefObject<HTMLDivElement | null>
  visuals: ReadonlyMap<string, SuiteVisual>
  onSelect: (id: string) => void
}

/** Shows a suite's tooltip by the pointer. The width is measured only when the text changes, not per move. */
function tooltipFor(tip: RefObject<HTMLDivElement | null>) {
  let text = ''
  let width = 0
  return (v: SuiteVisual | undefined, x: number, y: number, canvasWidth: number) => {
    const el = tip.current
    if (!el) return
    el.hidden = !v
    if (!v) return
    if (v.tooltip !== text) {
      text = v.tooltip
      el.textContent = text
      width = el.offsetWidth
    }
    const left = x + 14 + width > canvasWidth ? x - 14 - width : x + 14
    el.style.setProperty('left', `${Math.max(left, 0)}px`)
    el.style.setProperty('top', `${y + 16}px`)
  }
}

const input = (e: PointerEvent): PointerInput =>
  ({ id: e.pointerId, x: e.clientX, y: e.clientY, button: e.button, pointerType: e.pointerType, isPrimary: e.isPrimary })

/** Click to select (never after a drag or a pinch), hover to highlight and show the suite's tooltip. */
export function usePicker(p: Pick): void {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const el = gl.domElement
    const ray = new Raycaster()
    const tooltip = tooltipFor(p.tooltip)
    let gesture = IDLE
    const pick = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const group = p.group.current
      const at = { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }
      return { id: group ? raycastAt(ray, camera, group, at.x, at.y, r.width, r.height) : null, at }
    }
    const hover = (e: PointerEvent | null) => {
      const hit = e && e.buttons === 0 ? pick(e) : null
      const id = hit?.id ?? null
      tooltip(id ? p.visuals.get(id) : undefined, hit?.at.x ?? 0, hit?.at.y ?? 0, hit?.at.w ?? 0)
      if (p.hover.current === id) return
      p.hover.current = id
      p.mats.setHover(id)
      el.style.setProperty('cursor', id ? 'pointer' : '')
      invalidate()
    }
    const handlers: [string, (e: PointerEvent) => void][] = [
      ['pointerdown', (e) => { gesture = pointerDown(gesture, input(e)) }],
      ['pointerup', (e) => {
        const r = pointerUp(gesture, input(e))
        gesture = r.state
        const id = r.click ? pick(e).id : null
        if (id) p.onSelect(id)
      }],
      ['pointercancel', (e) => { gesture = pointerCancel(gesture, e.pointerId) }],
      ['lostpointercapture', () => { gesture = captureLost() }],
      ['pointermove', (e) => hover(e)],
      ['pointerleave', () => hover(null)],
    ]
    for (const [type, h] of handlers) el.addEventListener(type, h as EventListener)
    return () => { for (const [type, h] of handlers) el.removeEventListener(type, h as EventListener) }
  }, [gl, camera, invalidate, p])
}

const LOST_MS = 2500 // how long a lost context may take to come back before the 2D stack takes over

/**
 * Asks the browser to restore a lost WebGL context, redraws when it comes back (rendering is on demand, so
 * nothing else would), and reports a loss that lasts longer than LOST_MS. Listeners and the timer go with
 * the scene, so the renderer's own forced loss on unmount is not mistaken for a failure.
 */
export function useContextWatch(onLost: () => void): void {
  const canvas = useThree((s) => s.gl.domElement)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const stop = () => { if (timer) clearTimeout(timer); timer = null }
    const lost = (e: Event) => {
      e.preventDefault()
      stop()
      timer = setTimeout(onLost, LOST_MS)
    }
    const restored = () => {
      stop()
      invalidate()
    }
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', restored)
    return () => {
      stop()
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', restored)
    }
  }, [canvas, invalidate, onLost])
}
