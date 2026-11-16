import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react'
import { ON_SCREEN_RATIO, cityMotionRuns, coveredByModal, motionHeld, onScreenEnough } from './city/motion'
import { usePrinting } from './usePrinting'

// Whether the city's traffic should move now: the City switch is on, motion is welcome (reduced motion is not
// asked for, nor held by ?cityMotion=off, read once on load), the page is visible, at least a quarter of the
// scene is on screen, no modal covers it, and the page is not being printed (see cityMotionRuns).

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

const pageVisible = () => document.visibilityState === 'visible'

/** True while enough of `el` is in the viewport; true where IntersectionObserver is missing (nothing to go by). */
function useOnScreen(el: RefObject<HTMLElement | null>): boolean {
  const observable = typeof IntersectionObserver === 'function'
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const target = el.current
    if (!observable || !target) return
    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1]
      if (last) setSeen(last.isIntersecting && onScreenEnough(last.intersectionRatio))
    }, { threshold: [0, ON_SCREEN_RATIO] })
    io.observe(target)
    return () => io.disconnect()
  }, [el, observable])
  return observable ? seen : true
}

/**
 * True while a modal covers `el`: DialogFrame sets `inert` on the app shell, ChangeDialog opens a native modal
 * <dialog>. Both are attributes set and removed by those components (ChangeDialog closes itself on unmount),
 * so one MutationObserver on `inert` and `open` sees every change.
 */
function useCovered(el: RefObject<HTMLElement | null>): boolean {
  const [covered, setCovered] = useState(false)
  useEffect(() => {
    const target = el.current
    if (!target || typeof MutationObserver !== 'function') return
    const check = () => setCovered(coveredByModal(target))
    const mo = new MutationObserver(check)
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['inert', 'open'] })
    check()
    return () => mo.disconnect()
  }, [el])
  return covered
}

export function useCityMotion(root: RefObject<HTMLElement | null>, city: boolean, reduced: boolean): boolean {
  const visible = useSyncExternalStore(subscribeVisibility, pageVisible, () => false)
  const onScreen = useOnScreen(root)
  const covered = useCovered(root)
  const printing = usePrinting()
  const [held] = useState(() => motionHeld(window.location.search))
  return cityMotionRuns({ city, reduced, held, visible, onScreen, covered, printing })
}
