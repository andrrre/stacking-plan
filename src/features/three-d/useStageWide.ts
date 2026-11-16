import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { pendingDrawerShift } from '../layout/drawerGeometry'
import { WIDE_STAGE } from './camera'

/**
 * A ref for the stage, and whether it is wide (controls down the right, see WIDE_STAGE), judged on the width it will settle at
 * once a side drawer has finished sliding. Deciding on the final size at the start of a slide keeps the
 * controls and the camera insets from switching half-way through it, so the building scales smoothly.
 */
export function useStageWide(): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const update = () => setWide(el.clientWidth + pendingDrawerShift() >= el.clientHeight * WIDE_STAGE)
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, wide]
}
