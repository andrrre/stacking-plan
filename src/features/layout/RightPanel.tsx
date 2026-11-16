import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { SuiteDetails } from '../details/SuiteDetails'
import { MatchList } from '../finder/MatchList'
import { MatchWhy } from '../finder/MatchWhy'
import { viewKey, type PanelView } from './drawers'
import { usePanelFocus, useReturnFocus } from './drawerFocus'
import type { RightDrawer } from './useDrawers'
import styles from './RightPanel.module.css'

/** The longest a closing slide keeps its content if no transitionend arrives (240 ms slide, reduced motion: 0). */
const SLIDE_MS = 320

/**
 * What the drawer renders: the live view while open; while it slides shut, the last view it showed (inert),
 * dropped when the slide ends.
 */
function useSlidingView(view: PanelView, open: boolean) {
  const [last, setLast] = useState(view)
  const [sliding, setSliding] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (open && viewKey(last) !== viewKey(view)) setLast(view)
  if (wasOpen !== open) {
    setWasOpen(open)
    setSliding(!open)
  }
  useEffect(() => {
    if (!sliding) return undefined
    const timer = setTimeout(() => setSliding(false), SLIDE_MS)
    return () => clearTimeout(timer)
  }, [sliding])
  return { shown: open ? view : sliding ? last : null, onSlideEnd: () => setSliding(false) }
}

function CloseIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function Content({ view }: { view: PanelView | null }) {
  if (view?.kind === 'match') return <MatchWhy candidate={view.candidate} rank={view.rank} />
  if (view?.kind === 'suite') return <SuiteDetails suiteId={view.suiteId} />
  if (view?.kind === 'list') return <MatchList />
  return null
}

/**
 * The right drawer: match why → suite details → match list (or no fit). Closed and inert when there is nothing
 * to show. Close (or Escape inside it) clears a selection, handing focus to the match list when a search takes
 * over, or dismisses the list; once the drawer shuts, focus goes back to the stage.
 */
export function RightPanel({ view, open, onClose }: RightDrawer) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const { panelRef, onPanelClick, focusNext } = usePanelFocus(() => closeRef.current)
  const returnFocus = useReturnFocus(viewKey(view))
  const { shown, onSlideEnd } = useSlidingView(view, open)
  const close = () => {
    if (onClose()) returnFocus()
    else focusNext('list')
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    if (e.target instanceof Element && e.target.closest('dialog, [role=dialog]')) return // a dialog owns its Escape
    e.preventDefault() // the KPI bar leaves its highlight alone
    close()
  }
  return (
    <div className={styles.drawer} data-drawer="right" data-open={String(open)} data-print="hide"
      onTransitionEnd={(e) => { if (e.target === e.currentTarget && !open) onSlideEnd() }}>
      <div className={styles.clip}>
        <aside ref={panelRef} onClick={onPanelClick} onKeyDown={onKeyDown} className={styles.panel} data-testid="right-panel"
          data-open={String(open)} aria-label="Details" inert={!open}>
          <div className={styles.bar}>
            <span className={styles.eyebrow}>Details</span>
            <button ref={closeRef} type="button" className={styles.close} data-testid="right-drawer-close" aria-label="Close details" title="Close details" onClick={close}>
              <CloseIcon />
            </button>
          </div>
          <Content view={shown} />
        </aside>
      </div>
    </div>
  )
}
