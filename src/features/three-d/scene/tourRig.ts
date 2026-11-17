import type { PerspectiveCamera } from 'three'
import type { Vec3 } from '../camera'
import { tourGlideAt, tourGlideEased, type Shot, type TourGlide, type Via } from '../glide'
import { EXTERIOR_FOV, INTERIOR_FOV, PAN_MS, clampLook, lookTarget, panYaw, type Look } from '../tourCamera'

// The suite tour camera's moving parts: a flight in progress (position, aim and lens together), or the interior
// look (standing still, a slow pan and the user's drag). One instance per rig; each frame `step` writes the camera
// from a shot it owns, so a running tour allocates nothing per frame. `share` is how much of the stage's view
// offset (the orbit view's shift clear of the controls) the projection keeps: a flight blends it to its own
// (none on the tour, all of it on the way back), so taking the camera over and handing it back never jump.

export type TourMode = 'idle' | 'fly' | 'look' | 'exit'

/** Drag sensitivity inside the suite (degrees per CSS px). */
const DRAG_DEG_PER_PX = 0.2

function applyShot(camera: PerspectiveCamera, s: Shot): void {
  camera.position.set(s.position[0], s.position[1], s.position[2])
  camera.lookAt(s.target[0], s.target[1], s.target[2])
  if (camera.fov !== s.fov) {
    camera.fov = s.fov
    camera.updateProjectionMatrix()
  }
}

export class TourRig {
  mode: TourMode = 'idle'
  private flight: TourGlide | null = null
  private arrive: (() => void) | null = null
  private readonly shot: Shot = { position: [0, 0, 0], target: [0, 0, 0], fov: EXTERIOR_FOV }
  private look: Look | null = null
  private panStart: number | null = null
  private drag = { yaw: 0, pitch: 0 }
  private grabbedAt: { x: number; y: number } | null = null
  private shareFrom = 1
  private shareTo = 1
  /** The share of the stage's view offset the projection keeps now (1: the orbit view's own; 0: centred). */
  share = 1

  /** True while the interior pan runs. */
  get panning(): boolean {
    return this.panStart !== null
  }

  /** How far the look has turned from the stop's own view (degrees, unbounded: a full turn is 360), as last drawn. */
  yaw = 0

  /** Starts from where the camera is now, looking at `target`. */
  from(camera: PerspectiveCamera, target: Readonly<Vec3>): void {
    this.shot.position[0] = camera.position.x
    this.shot.position[1] = camera.position.y
    this.shot.position[2] = camera.position.z
    this.shot.target[0] = target[0]
    this.shot.target[1] = target[1]
    this.shot.target[2] = target[2]
    this.shot.fov = camera.fov
    this.share = 1
  }

  /** Where the camera is now (the flight's or the look's position). */
  get at(): Readonly<Vec3> {
    return this.shot.position
  }

  /**
   * Flies from the current shot to `to` over `ms` (by `via`, if set), the view offset's share easing to `share`;
   * `arrive` runs once it is there.
   */
  fly(to: Shot, ms: number, arrive: () => void, now: number, o: { mode?: TourMode; via?: Via; share?: number } = {}): void {
    const s = this.shot
    this.mode = o.mode ?? 'fly'
    this.look = null
    this.panStart = null
    this.flight = { from: { position: [...s.position], target: [...s.target], fov: s.fov }, to, start: now, ms, via: o.via }
    this.arrive = arrive
    this.shareFrom = this.share
    this.shareTo = o.share ?? 0
  }

  /** Moves where the flight in progress ends (the stage was resized under it), keeping its progress. */
  retarget(to: Shot): void {
    if (this.flight) this.flight = { ...this.flight, to }
  }

  /** Stands inside: at `look`, with the pan starting at `now` (null: no pan, as under reduced motion). */
  stand(look: Look, now: number | null): void {
    this.mode = 'look'
    this.flight = null
    this.arrive = null
    this.look = look
    this.drag = { yaw: 0, pitch: 0 }
    this.yaw = 0
    this.shot.fov = INTERIOR_FOV // a cut (reduced motion) arrives here without the flight that widens the lens
    this.share = 0
    this.panStart = now
  }

  stop(): void {
    this.mode = 'idle'
    this.flight = null
    this.arrive = null
    this.look = null
    this.panStart = null
  }

  /** Moves the camera for `now`; true while it is still moving (the caller asks for another frame). */
  step(camera: PerspectiveCamera, now: number): boolean {
    if (this.flight) return this.stepFlight(camera, now)
    if (this.mode !== 'look' || !this.look) return false
    const ms = this.panStart === null ? 0 : now - this.panStart
    const l = clampLook(panYaw(ms) + this.drag.yaw, this.look.pitch + this.drag.pitch)
    const s = this.shot
    s.position[0] = this.look.eye[0]
    s.position[1] = this.look.eye[1]
    s.position[2] = this.look.eye[2]
    lookTarget(this.look.eye, this.look.yaw + l.yaw, l.pitch, s.target)
    applyShot(camera, s)
    this.yaw = l.yaw
    if (this.panStart === null) return false
    if (ms < PAN_MS) return true
    this.drag.yaw += panYaw(ms) // the turn is done: it stays turned (a full turn), and a drag carries on from there
    this.panStart = null
    return false
  }

  private stepFlight(camera: PerspectiveCamera, now: number): boolean {
    const g = this.flight
    if (!g) return false
    const done = tourGlideAt(g, now, this.shot)
    this.share = this.shareFrom + (this.shareTo - this.shareFrom) * tourGlideEased(g, now)
    applyShot(camera, this.shot)
    if (!done) return true
    this.flight = null
    const arrive = this.arrive
    this.arrive = null
    arrive?.()
    return true // one more frame, for whatever the arrival started
  }

  /** A press inside the suite starts a drag-to-look (the pan stops where it is); false outside the interior. */
  grab(x: number, y: number, now: number): boolean {
    if (this.mode !== 'look' || !this.look) return false
    if (this.panStart !== null) {
      this.drag.yaw += panYaw(now - this.panStart)
      this.panStart = null
    }
    this.grabbedAt = { x, y }
    return true
  }

  /** Turns the look by the pointer's travel since the last call; false when no drag is under way. */
  dragTo(x: number, y: number): boolean {
    const at = this.grabbedAt
    if (!at || this.mode !== 'look' || !this.look) return false
    const turned = clampLook(this.drag.yaw + (x - at.x) * DRAG_DEG_PER_PX, this.look.pitch + this.drag.pitch + (y - at.y) * DRAG_DEG_PER_PX)
    this.drag = { yaw: turned.yaw, pitch: turned.pitch - this.look.pitch }
    this.grabbedAt = { x, y }
    return true
  }

  release(): void {
    this.grabbedAt = null
  }
}
