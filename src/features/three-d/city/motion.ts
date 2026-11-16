import { z } from 'zod'
import type { StorageLike } from '../../../app/state/storage'

// When the city's cars and people move, the clock that moves them, how far back the city stands, and the City
// switch's saved setting. Pure apart from the storage and the element handed in.

/** `held`: the URL asks for the traffic to stand still (see motionHeld); `covered`: a modal is open over the app. */
export type MotionInputs = {
  city: boolean; reduced: boolean; held: boolean; visible: boolean; onScreen: boolean; covered: boolean; printing: boolean
}

/** The traffic animates only while it can be seen and motion is welcome; otherwise it stands still. */
export const cityMotionRuns = (m: MotionInputs): boolean =>
  m.city && !m.reduced && !m.held && m.visible && m.onScreen && !m.covered && !m.printing

/** The share of the scene that must be in the viewport for the traffic to move. */
export const ON_SCREEN_RATIO = 0.25
export const onScreenEnough = (ratio: number): boolean => ratio >= ON_SCREEN_RATIO

/**
 * Whether a modal covers the scene: it sits inside an inert subtree (DialogFrame makes the app shell inert) or
 * a native modal <dialog> is open (showModal).
 */
export function coveredByModal(el: Element): boolean {
  return el.isConnected && (el.closest('[inert]') !== null || el.ownerDocument.querySelector('dialog[open]') !== null)
}

/** How strongly the city is drawn: 1 around the whole building, 0.4 in floor view, 1 → 0.5 as the floors separate. */
export const cityDim = (floor: number | null, spread: number): number => (floor !== null ? 0.4 : 1 - 0.5 * spread)

const Held = z.literal('off')

/**
 * `?cityMotion=off` holds the traffic still, like reduced motion but without changing anything else (tests,
 * recording; as `?today=` pins the clock). Any other value is ignored.
 */
export const motionHeld = (search: string): boolean => Held.safeParse(new URLSearchParams(search).get('cityMotion')).success

export const FRAME_MS = 1000 / 30 // about 30 frames a second: enough for slow traffic, half the work of 60
export const MAX_STEP_MS = 100 // the most one tick moves the clock (after a pause the city carries on, it does not jump)

/** `at`: when the last tick ran (ms, the rAF clock); `elapsed`: the city's own clock in seconds. */
export type Tick = { at: number; elapsed: number }

/** The next tick at `now`, or null while a frame interval has not passed yet. */
export function nextTick(last: Tick, now: number): Tick | null {
  const dt = now - last.at
  if (dt < FRAME_MS - 0.5) return null
  return { at: now, elapsed: last.elapsed + Math.min(dt, MAX_STEP_MS) / 1000 }
}

export const CITY_KEY = 'stackmatch.v1.city'
const Stored = z.boolean()

/** The saved City switch; on unless a valid `false` is stored. Unreadable storage reads as on. */
export function loadCity(storage: StorageLike | null): boolean {
  try {
    const raw = storage?.getItem(CITY_KEY)
    if (raw === null || raw === undefined) return true
    const parsed = Stored.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : true
  } catch {
    return true
  }
}

/** A failed save (quota, private mode) is silent: the switch still works for this visit. */
export function saveCity(storage: StorageLike | null, on: boolean): void {
  try {
    storage?.setItem(CITY_KEY, JSON.stringify(on))
  } catch {
    // ignored by design, as for the other saved settings
  }
}
