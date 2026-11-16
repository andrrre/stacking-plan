import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { browserStorage } from '../../app/state/storage'
import { useAppState } from '../../app/state/useAppState'
import { useMatches } from '../finder/useMatches'
import { useShortlist } from '../shortlist/useShortlist'
import { dismissalFor, panelView, rightDrawerOpen, type Dismissal, type PanelView } from './drawers'
import { loadLeftDrawer, saveLeftDrawer } from './leftDrawer'

// The two side drawers. The left one (requirement and shortlist) opens and closes on its handle, remembered
// in localStorage. The right one (details) is open whenever it has something to show, unless closed for the
// current requirement and selection. Below 1100 px the drawers overlay the stage, so only one is open at a time:
// the right one hides the left while it is open, and opening the left dismisses the right. There the left one
// starts closed on a first visit, and a list found while the user types in it waits for focus to leave it.

/** `onFocusWithin` reports whether focus is inside the left drawer. */
export type LeftDrawer = { open: boolean; count: number; onToggle: () => void; onFocusWithin: (inside: boolean) => void }
/** `onClose` returns whether the drawer is closing (false: a cleared selection hands over to the match list). */
export type RightDrawer = { view: PanelView; open: boolean; onClose: () => boolean }

/** Below this width the drawers overlay the stage instead of pushing it (matches the CSS media queries). */
const NARROW = '(max-width: 1099.98px)'

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const mq = window.matchMedia(NARROW)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

const readNarrow = () => typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches

function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, readNarrow, () => false)
}

function useRightDrawer() {
  const { state, dispatch } = useAppState()
  const { matches } = useMatches()
  const view = panelView(state, matches)
  // A11: a match selection whose suites no longer form a current candidate (date move, Clear) is cleared.
  const stale = state.selection?.kind === 'match' && view.kind !== 'match'
  useEffect(() => {
    if (stale) dispatch({ type: 'select', selection: null })
  }, [stale, dispatch])
  const [dismissal, setDismissal] = useState<Dismissal>(null)
  const { req, selection } = state
  // A new selection ends any dismissal: closing it later goes back to the list (if there is one).
  const [seen, setSeen] = useState(selection)
  if (seen !== selection) {
    setSeen(selection)
    if (selection !== null) setDismissal(null)
  }
  const open = rightDrawerOpen(state, matches, dismissal)
  /**
   * Close clears a selection (with a search, the match list takes its place); with nothing selected it
   * dismisses the list until the requirement changes or something is selected. Returns whether it shuts.
   */
  const onClose = useCallback(() => {
    const next = { ...state, selection: null }
    const nextDismissal = selection === null ? dismissalFor(next) : null
    if (selection !== null) dispatch({ type: 'select', selection: null })
    setDismissal(nextDismissal)
    return !rightDrawerOpen(next, matches, nextDismissal)
  }, [state, selection, matches, dispatch])
  /** Hides the drawer without touching the selection (a narrow screen giving its room to the left drawer). */
  const onYield = useCallback(() => setDismissal(dismissalFor({ req, selection })), [req, selection])
  return { view, open, onClose, onYield }
}

export function useDrawers(): { left: LeftDrawer; right: RightDrawer } {
  const right = useRightDrawer()
  const narrow = useNarrow()
  const count = useShortlist().length
  // A first visit (nothing stored) opens the left drawer only where it can push the stage.
  const [stored, setStored] = useState(() => loadLeftDrawer(browserStorage()))
  const preferOpen = stored ?? !narrow
  const [focusInLeft, setFocusInLeft] = useState(false)
  // Narrow: a match list that appears while the user works in the left drawer (typing a size, asking) waits
  // until focus leaves it, so the drawer being typed into is never taken away. A selection opens at once.
  const listWaits = narrow && preferOpen && focusInLeft && right.view.kind === 'list'
  const rightOpen = right.open && !listWaits
  const open = preferOpen && !(narrow && rightOpen)
  const { onYield } = right
  const onToggle = useCallback(() => {
    setStored(!open)
    saveLeftDrawer(browserStorage(), !open)
    if (!open && narrow) onYield()
  }, [open, narrow, onYield])
  return {
    left: { open, count, onToggle, onFocusWithin: setFocusInLeft },
    right: { view: right.view, open: rightOpen, onClose: right.onClose },
  }
}
