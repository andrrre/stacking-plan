import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { TourPhase } from '../../../app/state/types'
import { framePose, type Insets, type Pose } from '../camera'
import type { Shot } from '../glide'
import type { Bounds } from '../layout3d'
import {
  ENTER_MS, EXIT_MS, EXTERIOR_FOV, EXTERIOR_NEAR, FLY_MS, INTERIOR_FOV, INTERIOR_NEAR,
  enterVia, exteriorBounds, exteriorView, interiorLook, lookTarget, nearFor, type Footprint, type Look,
} from '../tourCamera'
import { TourRig } from './tourRig'

// The suite tour's part of the camera rig. While a tour runs it owns the camera: the orbit controls are off
// (they would clamp a camera looking out of the facade back to the front half), the projection is centred (the
// orbit view's offset eases out over the first flight and back in over the last), the near plane comes in while
// the camera is in or at the stop's room, and the camera flies out to the stop's floor, then into the suite, where
// it turns once all the way round and can be dragged to look about in any direction. When the tour ends it flies back to the building's
// framing and hands the camera back. Rendering is on demand: a frame is asked for each frame only while the
// camera flies or pans, so an idle tour (and an idle stage) renders nothing.

/** What the rig is told about the tour: the stop shown, how far in, and its floor area. */
export type TourCue = { index: number; phase: TourPhase; foot: Footprint; building: Bounds }

type Input = {
  camera: PerspectiveCamera
  controls: OrbitControls
  el: HTMLElement
  invalidate: () => void
  cue: TourCue | null
  reduced: boolean
  size: { width: number; height: number }
  framing: () => Pose // the building's framing, to fly back to
  stopOrbit: () => void // drops an orbit glide in flight
  restore: () => void // puts the camera on the framing, with its shift and zoom limits
  shift: () => { x: number; y: number } // the orbit view's offset clear of the controls (CSS px)
  room: Footprint | null // the room the camera is in, going into or leaving (its floor opened)
  onOutside?: () => void // the camera has left that room
  onPhase?: (index: number, phase: TourPhase) => void
  onLook?: () => void // the user dragged to look about (pauses the tour)
}

const TOUR_INSETS: Insets = { top: 60, right: 60, bottom: 60, left: 60 }

/** Applies `share` of the stage's view offset (0: a centred projection), only when it changed. */
function applyShare(i: Input, share: number, last: { current: string }): void {
  const { x, y } = i.shift()
  const { width: w, height: h } = i.size
  const key = `${share}|${x}|${y}|${w}x${h}`
  if (key === last.current) return
  last.current = key
  if (share === 0) i.camera.clearViewOffset()
  else i.camera.setViewOffset(w, h, x * share, y * share, w, h)
}

/**
 * Writes the camera each frame while the tour moves it: its place, its share of the view offset and its near
 * plane (the interior one only in or at the room, switched as it crosses the facade or roof line). Tells when
 * it has left the room, and reports the tour camera's state on the canvas (tests).
 */
function useTourFrame(rig: TourRig, live: { current: Input }): void {
  const inside = useRef(false)
  const shared = useRef('')
  useFrame(() => {
    const i = live.current
    if (rig.mode === 'idle') {
      inside.current = false
      shared.current = ''
      return
    }
    if (rig.step(i.camera, performance.now())) i.invalidate()
    applyShare(i, rig.share, shared)
    const near = nearFor(rig.at, i.room)
    setNear(i.camera, near)
    if (inside.current && near !== INTERIOR_NEAR) i.onOutside?.()
    inside.current = near === INTERIOR_NEAR
    i.el.setAttribute('data-tour-camera', rig.mode)
    i.el.setAttribute('data-tour-pan', rig.panning ? 'on' : 'off')
    i.el.setAttribute('data-tour-yaw', rig.yaw.toFixed(1)) // degrees turned from the stop's view (360: once round)
  })
}

/** Drag to look about inside the suite: the pan stops where it is and the tour pauses. */
function useLookDrag(rig: TourRig, el: HTMLElement, invalidate: () => void, onLook?: () => void): void {
  const told = useRef(onLook)
  useEffect(() => {
    told.current = onLook
  }, [onLook])
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (rig.grab(e.clientX, e.clientY, performance.now())) told.current?.()
    }
    const move = (e: PointerEvent) => {
      if (rig.dragTo(e.clientX, e.clientY)) invalidate()
    }
    const up = () => rig.release()
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [rig, el, invalidate])
}

/** The exterior shot of the stop's floor (the building's own lens). */
function exteriorShot(cue: TourCue, size: Input['size']): Shot {
  const pose = framePose(exteriorBounds(cue.foot, cue.building), exteriorView(cue.foot, cue.building), size, TOUR_INSETS)
  return { position: pose.position, target: pose.target, fov: EXTERIOR_FOV }
}

const interiorShot = (look: Look): Shot => ({ position: [...look.eye], target: lookTarget(look.eye, look.yaw, look.pitch), fov: INTERIOR_FOV })

function setNear(camera: PerspectiveCamera, near: number): void {
  if (camera.near === near) return
  camera.near = near
  camera.updateProjectionMatrix()
}

/** Takes the camera from the orbit controls, starting from the view they left (its view offset still on). */
function takeOver(i: Input, rig: TourRig): void {
  i.stopOrbit()
  i.controls.enabled = false
  const t = i.controls.target
  rig.from(i.camera, [t.x, t.y, t.z])
}

/**
 * One phase of a stop: fly out to its floor, fly in (square to the facade for the last stretch: enterVia), or
 * stand inside; under reduced motion it cuts straight inside.
 */
function playPhase(i: Input, rig: TourRig, cue: TourCue): void {
  const report = (phase: TourPhase) => () => i.onPhase?.(cue.index, phase)
  const look = interiorLook(cue.foot)
  const now = performance.now()
  if (cue.phase !== 'look' && i.reduced) report('look')()
  else if (cue.phase === 'fly') rig.fly(exteriorShot(cue, i.size), FLY_MS, report('enter'), now)
  else if (cue.phase === 'enter') rig.fly(interiorShot(look), ENTER_MS, report('look'), now, { via: enterVia(rig.at, cue.foot, look.eye) })
  else rig.stand(look, i.reduced ? null : now)
}

/**
 * Flies back to the building's framing (a cut under reduced motion) and gives the camera back to the controls, as
 * the rig is when the flight lands (`live`: the stage may have been resized on the way).
 */
function handBack(live: { current: Input }, rig: TourRig, owns: { current: boolean }): void {
  const finish = () => {
    const i = live.current
    rig.stop()
    owns.current = false
    setNear(i.camera, EXTERIOR_NEAR)
    i.camera.fov = EXTERIOR_FOV
    i.camera.updateProjectionMatrix()
    i.controls.enabled = true
    i.restore()
    i.onOutside?.() // a cut (reduced motion) leaves the room without a frame that would say so
    i.el.setAttribute('data-tour-camera', 'idle')
    i.el.setAttribute('data-tour-pan', 'off')
  }
  if (live.current.reduced) {
    finish()
    return
  }
  const f = live.current.framing()
  rig.fly({ position: f.position, target: f.target, fov: EXTERIOR_FOV }, EXIT_MS, finish, performance.now(), { mode: 'exit', share: 1 })
}

/**
 * Runs the tour's camera. Returns `owns`: true from a tour's start until the camera is handed back, while the
 * rig's own framing must leave the camera alone; and `reframe`, which the rig calls instead when its framing
 * changes (the stage resized as the tour hid or brought back the bars around it): a flight out to the floor
 * or back to the building then ends where the new size frames it.
 */
export function useTourCamera(i: Input): { owns: RefObject<boolean>; reframe: () => void } {
  const [rig] = useState(() => new TourRig())
  const owns = useRef(false)
  const live = useRef(i)
  useEffect(() => {
    live.current = i
  })
  useTourFrame(rig, live)
  useLookDrag(rig, i.el, i.invalidate, i.onLook)
  const { cue, reduced } = i
  useEffect(() => {
    const now = live.current
    if (!cue) {
      if (owns.current && rig.mode !== 'exit') handBack(live, rig, owns)
    } else {
      if (!owns.current) takeOver(now, rig)
      owns.current = true
      playPhase(now, rig, cue)
      now.el.setAttribute('data-tour-camera', rig.mode)
    }
    now.invalidate()
  }, [cue, reduced, rig])
  const reframe = useCallback(() => {
    const { cue: c, size, framing } = live.current
    if (rig.mode === 'exit') {
      const f = framing()
      rig.retarget({ position: f.position, target: f.target, fov: EXTERIOR_FOV })
    } else if (rig.mode === 'fly' && c?.phase === 'fly') rig.retarget(exteriorShot(c, size))
  }, [rig])
  return useMemo(() => ({ owns, reframe }), [reframe])
}
