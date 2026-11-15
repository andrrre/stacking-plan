import { useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MOUSE, TOUCH, Vector3, type PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  AZIMUTH_LIMIT, DEFAULT_VIEW, ELEVATION_RANGE, SEPARATED_VIEW, framePose, insetsFor, lerpView, viewOf, viewShift, zoomedIn,
  NO_OFFSET, applyOffset, offsetBetween, type Offset, type Pose, type Vec3, type Zoom,
} from '../camera'
import { boundsKey, type Bounds } from '../layout3d'
import type { Rig } from '../sceneTypes'

// Orbit controls limited to the front half (labels are on the front faces) and above the ground, with no
// pan, damping or auto-rotation. The camera frames the whole building whenever its outline, the canvas size
// or the floor separation changes, and on Reset view. Zooming in goes past the framing (towards the pointer
// for wheel and pinch) for detail and is never undone automatically; an orbit or zoom-out that ends at or
// beyond the framing distance glides back so the whole building is in view and centred. Where the buttons
// left the camera is kept as an offset from the framing that every reframe re-applies (until Reset view), so
// a press made while the floors are moving apart or together is not wiped out by the per-frame reframing.

const rad = (deg: number) => (deg * Math.PI) / 180
const UP = new Vector3(0, 1, 0)
const MAX_ZOOM_OUT = 1.7
/** How far zoom-in may go, as a share of the framing distance: a 25-floor facade reaches label height. */
const MAX_ZOOM_IN = 0.3
const SETTLE_MS = 240

function configure(c: OrbitControls): void {
  c.enablePan = false
  c.enableDamping = false
  c.rotateSpeed = 0.45
  c.zoomSpeed = 0.8
  c.zoomToCursor = true
  c.minAzimuthAngle = -rad(AZIMUTH_LIMIT)
  c.maxAzimuthAngle = rad(AZIMUTH_LIMIT)
  c.minPolarAngle = rad(90 - ELEVATION_RANGE.max)
  c.maxPolarAngle = rad(90 - ELEVATION_RANGE.min)
  c.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
  c.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_ROTATE }
}

type Size = { width: number; height: number }

function applyPose(camera: PerspectiveCamera, c: OrbitControls, pose: Pose, size: Size): void {
  const shift = viewShift(insetsFor(size.width, size.height))
  camera.setViewOffset(size.width, size.height, shift.x, shift.y, size.width, size.height)
  camera.position.set(...pose.position)
  c.target.set(...pose.target)
  setLimits(c, pose.distance)
  c.update()
}

function setLimits(c: OrbitControls, fit: number): void {
  c.minDistance = fit * MAX_ZOOM_IN
  c.maxDistance = fit * MAX_ZOOM_OUT
}

/** Moves the camera around (rotate) or towards (zoom) the target; the controls clamp it to their limits. */
function nudge(camera: PerspectiveCamera, c: OrbitControls, degrees: number, factor: number): void {
  const offset = camera.position.clone().sub(c.target).applyAxisAngle(UP, rad(degrees)).multiplyScalar(factor)
  camera.position.copy(c.target).add(offset)
  c.update()
}

/** How far the camera is, against the full-building framing for its current angle; also sets the zoom limits. */
function zoomOf(camera: PerspectiveCamera, c: OrbitControls, bounds: Bounds, size: Size): Zoom & { fit: Pose } {
  const o = camera.position.clone().sub(c.target)
  const fit = framePose(bounds, viewOf([o.x, o.y, o.z]), size, insetsFor(size.width, size.height))
  setLimits(c, fit.distance)
  return { d: o.length(), ratio: o.length() / fit.distance, fit }
}

/** The full-building framing for the camera's current angle, keeping any zoom-out within limits. */
function restingPose(camera: PerspectiveCamera, c: OrbitControls, fit: Pose, d: number): Pose {
  const distance = Math.min(Math.max(d, fit.distance), fit.distance * MAX_ZOOM_OUT)
  const dir = camera.position.clone().sub(c.target).normalize()
  const t = fit.target
  return { target: t, distance, position: [t[0] + dir.x * distance, t[1] + dir.y * distance, t[2] + dir.z * distance] }
}

type Glide = { from: { p: Vector3; t: Vector3 }; to: Pose; start: number }

type Props = { bounds: Bounds; spread: number; reduced: boolean; rig: RefObject<Rig | null> }

export function CameraRig({ bounds, spread, reduced, rig }: Props) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const invalidate = useThree((s) => s.invalidate)
  // Created without a DOM element; it is connected in an effect, so StrictMode's replay cannot leave a
  // second, unconfigured instance listening on the canvas.
  const controls = useMemo(() => new OrbitControls(camera), [camera])
  const glide = useGlide(camera, controls, invalidate)
  // Refit only when the outline changes, not on every new layout object (a search must not reset the view).
  const [fitted, setFitted] = useState(bounds)
  if (boundsKey(fitted) !== boundsKey(bounds)) setFitted(bounds)

  // The full-building framing for the current outline, size and separation, and the camera placed at an
  // offset from it (the button turns and zooms the user has kept).
  const framing = useMemo(
    () => () => framePose(fitted, lerpView(DEFAULT_VIEW, SEPARATED_VIEW, spread), { width, height }, insetsFor(width, height)),
    [fitted, spread, width, height],
  )
  const frame = useMemo(() => (o: Offset) => {
    glide.stop()
    const f = framing()
    applyPose(camera, controls, { ...applyOffset(f, o), distance: f.distance }, { width, height })
    invalidate()
  }, [camera, controls, framing, width, height, invalidate, glide])
  const began = useRef<Zoom | null>(null)
  const begin = useMemo(() => () => {
    glide.stop()
    began.current = zoomOf(camera, controls, fitted, { width, height })
  }, [camera, controls, fitted, width, height, glide])
  /** Glides back to a full framing unless the user zoomed in; returns where the camera will come to rest. */
  const settle = useMemo(() => (): Pose | null => {
    const now = zoomOf(camera, controls, fitted, { width, height })
    const from = began.current ?? now
    began.current = null
    if (zoomedIn(from, now)) return null
    const to = restingPose(camera, controls, now.fit, now.d)
    glide.begin({ from: { p: camera.position.clone(), t: controls.target.clone() }, to, start: reduced ? -SETTLE_MS : performance.now() })
    invalidate()
    return to
  }, [camera, controls, fitted, width, height, reduced, invalidate, glide])
  useControlEvents(controls, gl.domElement, invalidate, settle, begin)
  useRigHandle(rig, { camera, controls, framing, frame, begin, settle })
  return null
}

type Handle = {
  camera: PerspectiveCamera
  controls: OrbitControls
  framing: () => Pose // the full-building framing for the current outline, size and separation
  frame: (o: Offset) => void // puts the camera at an offset from that framing
  begin: () => void
  settle: () => Pose | null
}

/**
 * Reframes when the outline, size or separation changes, and gives the control buttons their camera
 * commands. After each button press the camera's actual offset from the framing is kept (read back after
 * the controls clamped it, at the place the glide will come to rest), so every later reframe, one per frame
 * during a separate / rejoin move, puts the camera exactly where the user left it. Reset view clears it.
 */
function useRigHandle(rig: RefObject<Rig | null>, h: Handle): void {
  const { camera, controls, framing, frame, begin, settle } = h
  const offset = useRef<Offset>(NO_OFFSET)
  useEffect(() => frame(offset.current), [frame])
  useImperativeHandle(rig, () => {
    const press = (degrees: number, factor: number) => {
      begin()
      nudge(camera, controls, degrees, factor)
      const rest = settle()
      const now = rest ?? { position: camera.position.toArray() as Vec3, target: controls.target.toArray() as Vec3 }
      offset.current = offsetBetween(framing(), now)
    }
    return {
      reset: () => {
        offset.current = NO_OFFSET
        frame(NO_OFFSET)
      },
      rotate: (degrees: number) => press(degrees, 1),
      zoom: (factor: number) => press(0, factor),
    }
  }, [camera, controls, framing, frame, begin, settle])
}

/** The glide back to a full-building framing, one step per rendered frame: `begin` starts one, `stop` drops it. */
function useGlide(camera: PerspectiveCamera, controls: OrbitControls, invalidate: () => void) {
  const glide = useRef<Glide | null>(null)
  useFrame(() => {
    const g = glide.current
    if (!g) return
    const k = Math.min((performance.now() - g.start) / SETTLE_MS, 1)
    const e = k * (2 - k)
    camera.position.lerpVectors(g.from.p, new Vector3(...g.to.position), e)
    controls.target.lerpVectors(g.from.t, new Vector3(...g.to.target), e)
    controls.update()
    if (k >= 1) glide.current = null
    invalidate()
  })
  return useMemo(() => ({
    begin: (g: Glide) => { glide.current = g },
    stop: () => { glide.current = null },
  }), [])
}

function useControlEvents(controls: OrbitControls, el: HTMLElement, invalidate: () => void, settle: () => void, onStart: () => void) {
  useEffect(() => {
    configure(controls)
    controls.connect(el)
    return () => controls.disconnect()
  }, [controls, el])
  useEffect(() => {
    const onChange = () => invalidate()
    controls.addEventListener('change', onChange)
    controls.addEventListener('start', onStart)
    controls.addEventListener('end', settle)
    return () => {
      controls.removeEventListener('change', onChange)
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end', settle)
    }
  }, [controls, invalidate, settle, onStart])
}
