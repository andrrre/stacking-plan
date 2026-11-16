import { useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MOUSE, TOUCH, Vector3, type PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  AZIMUTH_LIMIT, ELEVATION_RANGE, WIDE_STAGE, floorInsets, framePose, insetsFor, viewOf, viewShift, zoomedIn,
  NO_OFFSET, applyOffset, offsetBetween, type Insets, type Offset, type Pose, type Vec3, type View, type Zoom,
} from '../camera'
import { MAX_ZOOM_OUT, glideAt, limitsAfter, limitsDuring, limitsFor, retarget, type Glide, type Limits } from '../glide'
import { boundsKey, type Bounds } from '../layout3d'
import type { Rig } from '../sceneTypes'
import type { TourPhase } from '../../../app/state/types'
import { useTourCamera, type TourCue } from './useTourCamera'

// Orbit controls limited to the front half (labels are on the front faces) and above the ground, with no
// pan, damping or auto-rotation. The camera frames the whole building whenever its outline, the canvas size
// or the floor separation changes, and on Reset view. Zooming in goes past the framing (towards the pointer
// for wheel and pinch) for detail and is never undone automatically; an orbit or zoom-out that ends at or
// beyond the framing distance glides back so the whole building is in view and centred. Where the buttons
// left the camera is kept as an offset from the framing that every reframe re-applies (until Reset view), so
// a press made while the floors are moving apart or together is not wiped out by the per-frame reframing.
// In floor view the framing is the shown floor's plate from high above the front; a change of floor glides
// there (a jump under reduced motion), and entering or leaving floor view drops the kept offset. A refit
// during such a glide (the floors moving apart as floor view is left for Separate floors) moves its end
// rather than cutting it short. A suite tour takes the camera over (useTourCamera) and hands it back framed.

const rad = (deg: number) => (deg * Math.PI) / 180
const UP = new Vector3(0, 1, 0)
const SETTLE_MS = 240
const FLOOR_MS = 420 // the glide from one floor to the next in floor view

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

/** Centres the projection in the area the insets leave. */
function applyShift(camera: PerspectiveCamera, size: Size, insets: Insets): void {
  const shift = viewShift(insets)
  camera.setViewOffset(size.width, size.height, shift.x, shift.y, size.width, size.height)
}

function applyPose(camera: PerspectiveCamera, c: OrbitControls, pose: Pose, size: Size, insets: Insets): void {
  applyShift(camera, size, insets)
  camera.position.set(...pose.position)
  c.target.set(...pose.target)
  setLimits(c, pose.distance)
  c.update()
}

function setLimits(c: OrbitControls, fit: number): void {
  putLimits(c, limitsFor(fit))
}

/** Sets the controls' zoom limits; null leaves them as they are. */
function putLimits(c: OrbitControls, l: Limits | null): void {
  if (!l) return
  c.minDistance = l.min
  c.maxDistance = l.max
}

/** Moves the camera around (rotate) or towards (zoom) the target; the controls clamp it to their limits. */
function nudge(camera: PerspectiveCamera, c: OrbitControls, degrees: number, factor: number): void {
  const offset = camera.position.clone().sub(c.target).applyAxisAngle(UP, rad(degrees)).multiplyScalar(factor)
  camera.position.copy(c.target).add(offset)
  c.update()
}

/** How far the camera is, against the full-building framing for its current angle; also sets the zoom limits. */
function zoomOf(camera: PerspectiveCamera, c: OrbitControls, bounds: Bounds, size: Size, insets: Insets): Zoom & { fit: Pose } {
  const o = camera.position.clone().sub(c.target)
  const fit = framePose(bounds, viewOf([o.x, o.y, o.z]), size, insets)
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

/** `view` is the framing angle; `focus` the floor shown in floor view (null: the whole building); `tour` the suite tour's stop. */
type Props = {
  bounds: Bounds; view: View; focus: number | null; reduced: boolean; wide?: boolean; rig: RefObject<Rig | null>
  tour?: TourCue | null; onTourPhase?: (index: number, phase: TourPhase) => void; onTourLook?: () => void
}

export function CameraRig({ bounds, view, focus, reduced, wide, rig, tour = null, onTourPhase, onTourLook }: Props) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const invalidate = useThree((s) => s.invalidate)
  // Created without a DOM element; it is connected in an effect, so StrictMode's replay cannot leave a
  // second, unconfigured instance listening on the canvas.
  const controls = useMemo(() => new OrbitControls(camera), [camera])
  const glide = useGlide(camera, controls, invalidate)
  const insets = useMemo(() => (focus === null ? insetsFor : floorInsets)(width, height, wide ?? width >= height * WIDE_STAGE), [focus, width, height, wide])
  // Refit only when the outline changes, not on every new layout object (a search must not reset the view).
  const [fitted, setFitted] = useState(bounds)
  if (boundsKey(fitted) !== boundsKey(bounds)) setFitted(bounds)
  const { framing, frame } = useFraming({ camera, controls, glide, invalidate, fitted, view, width, height, insets })
  const tourCam = useTourCamera({
    camera, controls, el: gl.domElement, invalidate, cue: tour, reduced, size: { width, height }, framing,
    stopOrbit: glide.stop, restore: () => frame(NO_OFFSET), onPhase: onTourPhase, onLook: onTourLook,
  })
  const began = useRef<Zoom | null>(null)
  const begin = useMemo(() => () => {
    glide.stop()
    began.current = zoomOf(camera, controls, fitted, { width, height }, insets)
  }, [camera, controls, fitted, width, height, insets, glide])
  /** Glides back to a full framing unless the user zoomed in; returns where the camera will come to rest. */
  const settle = useMemo(() => (): Pose | null => {
    const now = zoomOf(camera, controls, fitted, { width, height }, insets)
    const from = began.current ?? now
    began.current = null
    if (zoomedIn(from, now)) return null
    const to = restingPose(camera, controls, now.fit, now.d)
    glide.begin({ from: placed(camera, controls), to, start: reduced ? -SETTLE_MS : performance.now(), ms: SETTLE_MS, limit: null })
    invalidate()
    return to
  }, [camera, controls, fitted, width, height, insets, reduced, invalidate, glide])
  useControlEvents(controls, gl.domElement, invalidate, settle, begin)
  useRigHandle(rig, { camera, controls, framing, frame, begin, settle, focus, reduced, gliding: glide.running, tour: tourCam })
  useCameraReport(gl.domElement, camera, controls, framing)
  return null
}

/**
 * Writes the camera's angle and zoom against the current framing onto the canvas, after every rendered frame
 * (`data-camera-azimuth` in degrees, `data-camera-zoom` as a distance factor; 1 = framed), and the camera's own
 * elevation above the horizon (`data-camera-elevation`, degrees), for tests.
 */
function useCameraReport(el: HTMLElement, camera: PerspectiveCamera, c: OrbitControls, framing: () => Pose): void {
  useFrame(() => {
    const now = placed(camera, c)
    const o = offsetBetween(framing(), now)
    el.setAttribute('data-camera-azimuth', o.azimuth.toFixed(1))
    el.setAttribute('data-camera-zoom', o.factor.toFixed(3))
    el.setAttribute('data-camera-elevation', viewOf(now.position.map((v, i) => v - (now.target[i] ?? 0)) as Vec3).elevation.toFixed(1))
    el.setAttribute('data-camera-fov', camera.fov.toFixed(1))
  })
}

const placed = (camera: PerspectiveCamera, c: OrbitControls) =>
  ({ position: camera.position.toArray() as Vec3, target: c.target.toArray() as Vec3 })

type FramingInput = {
  camera: PerspectiveCamera
  controls: OrbitControls
  glide: ReturnType<typeof useGlide>
  invalidate: () => void
  fitted: Bounds
  view: View
  width: number
  height: number
  insets: Insets
}

/**
 * The framing for the current outline, size and view, and `frame`, which places the camera at an offset
 * from it (the button turns and zooms the user has kept): by a glide when asked, else at once, unless a
 * glide between framings is running, which then ends there instead.
 */
function useFraming(i: FramingInput) {
  const { camera, controls, glide, invalidate, fitted, view, width, height, insets } = i
  const framing = useMemo(
    () => () => framePose(fitted, view, { width, height }, insets),
    [fitted, view, width, height, insets],
  )
  const frame = useMemo(() => (o: Offset, animate = false) => {
    const f = framing()
    const to = { ...applyOffset(f, o), distance: f.distance }
    if (animate) {
      applyShift(camera, { width, height }, insets)
      glide.begin({ from: placed(camera, controls), to, start: performance.now(), ms: FLOOR_MS, limit: f.distance })
    } else if (glide.retarget(to, f.distance)) applyShift(camera, { width, height }, insets)
    else {
      glide.stop()
      applyPose(camera, controls, to, { width, height }, insets)
    }
    invalidate()
  }, [camera, controls, framing, width, height, insets, invalidate, glide])
  return { framing, frame }
}

type Handle = {
  camera: PerspectiveCamera
  controls: OrbitControls
  framing: () => Pose // the framing for the current outline, size and view
  frame: (o: Offset, animate?: boolean) => void // puts the camera at an offset from that framing
  begin: () => void
  settle: () => Pose | null
  focus: number | null
  reduced: boolean
  gliding: () => boolean
  tour: { owns: RefObject<boolean>; reframe: () => void } // a suite tour has the camera: it reframes its own flights
}

/**
 * Reframes when the outline, size or separation changes, and gives the control buttons their camera
 * commands. After each button press the camera's actual offset from the framing is kept (read back after
 * the controls clamped it, at the place the glide will come to rest), so every later reframe, one per frame
 * during a separate / rejoin move, puts the camera exactly where the user left it. Reset view clears it.
 * A drag orbit or wheel zoom is read back the same way before each reframe (unless a glide is under way, which
 * reframing retargets), so a side drawer resizing the stage keeps the user's view relative to the new framing.
 */
function useRigHandle(rig: RefObject<Rig | null>, h: Handle): void {
  const { camera, controls, framing, frame, begin, settle, focus, reduced, gliding, tour } = h
  const offset = useRef<Offset>(NO_OFFSET)
  const shown = useRef(focus)
  const lastFraming = useRef<(() => Pose) | null>(null)
  useEffect(() => {
    if (tour.owns.current) { // the tour flies back to the plain framing: the kept turns and zooms are dropped
      offset.current = NO_OFFSET
      lastFraming.current = framing
      shown.current = focus
      tour.reframe()
      return
    }
    const moved = shown.current !== focus
    if (moved && (shown.current === null || focus === null)) offset.current = NO_OFFSET // into or out of floor view
    else if (!moved && lastFraming.current && !gliding()) offset.current = offsetBetween(lastFraming.current(), placed(camera, controls))
    lastFraming.current = framing
    shown.current = focus
    frame(offset.current, moved && !reduced)
  }, [frame, framing, focus, reduced, gliding, camera, controls, tour])
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

/**
 * Camera glides, one step per rendered frame: `begin` starts one, `stop` drops it, `retarget` moves the end
 * of a glide between framings. The zoom limits open while such a glide runs and are restored when it ends
 * or is stopped (see glide.ts).
 */
function useGlide(camera: PerspectiveCamera, controls: OrbitControls, invalidate: () => void) {
  const glide = useRef<Glide | null>(null)
  useFrame(() => {
    const g = glide.current
    if (!g) return
    const at = glideAt(g, performance.now())
    camera.position.set(...at.position)
    controls.target.set(...at.target)
    controls.update()
    if (at.done) {
      glide.current = null
      putLimits(controls, limitsAfter(g))
    }
    invalidate()
  })
  return useMemo(() => ({
    running: () => glide.current !== null,
    begin: (g: Glide) => {
      glide.current = g
      putLimits(controls, limitsDuring(g))
    },
    stop: () => {
      putLimits(controls, limitsAfter(glide.current))
      glide.current = null
    },
    retarget: (to: Pose, limit: number): boolean => {
      const next = glide.current && retarget(glide.current, to, limit)
      if (next) glide.current = next
      return Boolean(next)
    },
  }), [controls])
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
