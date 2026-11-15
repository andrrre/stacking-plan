import { useCallback, useRef, useState, type PointerEvent } from 'react'

/** The fixed axonometric angle the view starts at and returns to (spec-technical §5.6). */
export const DEFAULT_ANGLE = -35

const DEG_PER_PX = 0.5
const SLOP_PX = 4 // less than this is a click on a suite, not a rotation
const TOUCH_SLOP_PX = 10 // a finger wobbles more than a mouse

/** True when the angle is the default, or the default plus whole turns. */
export function isDefaultAngle(angle: number): boolean {
  const turn = (((angle - DEFAULT_ANGLE) % 360) + 360) % 360
  return turn < 0.01 || turn > 359.99
}

type Press = { pointerId: number; lastX: number; startX: number; slop: number; captured: boolean }

/** Reads a flag and clears it. */
function take(flag: { current: boolean }): boolean {
  const was = flag.current
  flag.current = false
  return was
}

const newPress = (e: PointerEvent<HTMLElement>): Press => ({
  pointerId: e.pointerId, lastX: e.clientX, startX: e.clientX, captured: false,
  slop: e.pointerType === 'touch' ? TOUCH_SLOP_PX : SLOP_PX,
})

/**
 * Horizontal drag turns the building about its vertical axis. The angle lives in local state (never in the
 * reducer). The click that ends a real drag is swallowed by `consumeDragClick`, so letting go over a suite
 * does not select it. The swallow flag clears itself right after the drag ends, so a later click that had
 * no pointerdown (assistive technology) is never eaten.
 */
export function useDragRotate() {
  const [angle, setAngle] = useState(DEFAULT_ANGLE)
  const [dragging, setDragging] = useState(false)
  const press = useRef<Press | null>(null)
  const dragged = useRef(false)

  const onPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    dragged.current = false
    press.current = newPress(e)
  }, [])

  const end = useCallback((target: HTMLElement | null, pointerId: number) => {
    const p = press.current
    if (!p) return
    if (p.captured) {
      target?.releasePointerCapture?.(pointerId)
      setTimeout(() => { dragged.current = false }, 0) // the click that ends the drag fires before this
    }
    press.current = null
    setDragging(false)
  }, [])

  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    const p = press.current
    if (!p || p.pointerId !== e.pointerId) return
    if (e.buttons === 0) { // the release happened somewhere we did not see
      end(e.currentTarget, e.pointerId)
      return
    }
    if (!p.captured) {
      if (Math.abs(e.clientX - p.startX) < p.slop) return
      p.captured = true
      dragged.current = true
      e.currentTarget.setPointerCapture?.(e.pointerId) // only once it is a drag, so plain clicks reach the suite
      setDragging(true)
    }
    const dx = e.clientX - p.lastX
    p.lastX = e.clientX
    setAngle((a) => a + dx * DEG_PER_PX)
  }, [end])

  const onPointerUp = (e: PointerEvent<HTMLElement>) => end(e.currentTarget, e.pointerId)
  const onLostPointerCapture = (e: PointerEvent<HTMLElement>) => end(null, e.pointerId)

  const consumeDragClick = useCallback(() => take(dragged), [])

  const rotateBy = useCallback((deg: number) => setAngle((a) => a + deg), [])
  const reset = useCallback(() => setAngle(DEFAULT_ANGLE), [])

  return {
    angle, dragging, rotateBy, reset, consumeDragClick,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onLostPointerCapture },
  }
}

export type DragRotate = ReturnType<typeof useDragRotate>
