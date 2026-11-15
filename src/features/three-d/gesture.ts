// Telling a click on the building from an orbit, a pinch or a cancelled touch. Pure and immutable: the
// canvas feeds pointer events in and gets the next state, plus whether a release was a click.

export type PointerInput = { id: number; x: number; y: number; button: number; pointerType: string; isPrimary: boolean }

type Press = { id: number; x: number; y: number; slop: number }

export type GestureState = {
  active: readonly number[] // pointer ids currently down
  press: Press | null // the first pointer of the gesture, if it can still become a click
  multi: boolean // more than one pointer took part: a pinch or two-finger turn, never a click
}

export const IDLE: GestureState = { active: [], press: null, multi: false }

/** Movement allowed between press and release for a click: a finger is less precise than a mouse. */
const slopFor = (pointerType: string) => (pointerType === 'touch' ? 10 : 4)

function release(s: GestureState, id: number): GestureState {
  const active = s.active.filter((p) => p !== id)
  if (active.length === 0) return IDLE
  return { active, press: s.press?.id === id ? null : s.press, multi: s.multi }
}

/**
 * A primary pointer going down while others are still listed means those never reported their release
 * (a lost capture): they are dropped and this press starts a fresh gesture. A second finger is not primary.
 */
export function pointerDown(s: GestureState, e: PointerInput): GestureState {
  if (s.active.length > 0 && !e.isPrimary) return { active: [...s.active, e.id], press: s.press, multi: true }
  const press = e.button === 0 ? { id: e.id, x: e.x, y: e.y, slop: slopFor(e.pointerType) } : null
  return { active: [e.id], press, multi: false }
}

export function pointerUp(s: GestureState, e: PointerInput): { state: GestureState; click: boolean } {
  const p = s.press
  const click = p !== null && p.id === e.id && !s.multi && Math.hypot(e.x - p.x, e.y - p.y) <= p.slop
  return { state: release(s, e.id), click }
}

export function pointerCancel(s: GestureState, id: number): GestureState {
  return release(s, id)
}

/** The canvas lost pointer capture: whatever was in progress is over. */
export function captureLost(): GestureState {
  return IDLE
}
