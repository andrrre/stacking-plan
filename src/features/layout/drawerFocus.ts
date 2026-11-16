import { useEffect, useRef, type MouseEvent } from 'react'

// Focus rules for the right drawer: keep focus in the panel when its content swaps, and give it back to the
// stage when the drawer shuts.

type FocusTarget = 'why' | 'list'

const FOCUS_SELECTOR: Record<FocusTarget, string> = {
  why: '[data-focus-target="why"]',
  list: '[data-focus-target="list"] button',
}

const STAGE = '[data-testid="center-pane"]'

/**
 * Keeps keyboard focus in the panel when a click inside it swaps the content (match card → why, All matches or
 * Jump to date → list). The clicked control names the target in `data-focus-next`; nothing else moves focus,
 * so typing in the form or dragging the slider never loses it. `focusNext` asks for the same after another
 * swap (Close handing a selection over to the list); `fallback` takes focus when the target is missing.
 */
export function usePanelFocus(fallback: () => HTMLElement | null) {
  const ref = useRef<HTMLElement>(null)
  const pending = useRef<FocusTarget | null>(null)
  const onClick = (e: MouseEvent) => {
    const next = e.target instanceof Element ? e.target.closest('[data-focus-next]')?.getAttribute('data-focus-next') : null
    if (next === 'why' || next === 'list') pending.current = next
  }
  useEffect(() => {
    if (!pending.current) return
    const target = ref.current?.querySelector<HTMLElement>(FOCUS_SELECTOR[pending.current]) ?? fallback()
    pending.current = null
    target?.focus()
  })
  const focusNext = (target: FocusTarget) => {
    pending.current = target
  }
  return { panelRef: ref, onPanelClick: onClick, focusNext }
}

/** Focuses the stage itself (not normally focusable) until focus moves on. */
function focusStage() {
  const stage = document.querySelector<HTMLElement>(STAGE)
  if (!stage) return
  stage.setAttribute('tabindex', '-1')
  stage.addEventListener('blur', () => stage.removeAttribute('tabindex'), { once: true })
  stage.focus()
}

/**
 * Remembers the control in the stage that changed what the drawer shows (a suite button in the mirror or the
 * 2D stack), so closing the drawer can hand focus back there, or to the stage when there is none. Each change
 * of view (`key`) records the stage control then focused, or forgets the opener if focus is elsewhere. Opening
 * never moves focus: a click in the scene keeps it in the scene.
 */
export function useReturnFocus(key: string) {
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const active = document.activeElement
    opener.current = active instanceof HTMLElement && active.closest(STAGE) ? active : null
  }, [key])
  return () => {
    const back = opener.current
    opener.current = null
    if (back?.isConnected) back.focus()
    else focusStage()
  }
}
