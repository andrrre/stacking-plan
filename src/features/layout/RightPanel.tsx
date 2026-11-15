import { useEffect, useRef, type MouseEvent } from 'react'
import { activeRequirement } from '../../app/state/selectors'
import type { AppState } from '../../app/state/types'
import { useAppState } from '../../app/state/useAppState'
import type { Candidate } from '../../domain/types'
import { SuiteDetails } from '../details/SuiteDetails'
import { MatchList } from '../finder/MatchList'
import { MatchWhy } from '../finder/MatchWhy'
import { useMatches } from '../finder/useMatches'
import styles from './RightPanel.module.css'

type PanelView =
  | { kind: 'match'; candidate: Candidate; rank: number }
  | { kind: 'suite'; suiteId: string }
  | { kind: 'list' }
  | { kind: 'empty' }

/** Right panel precedence (spec-technical §4): match → suite → requirement → empty. A stale match falls through. */
function panelView(state: AppState, matches: readonly Candidate[]): PanelView {
  const { selection } = state
  const index = selection?.kind === 'match' ? matches.findIndex((c) => c.key === selection.key) : -1
  const candidate = matches[index]
  if (candidate) return { kind: 'match', candidate, rank: index + 1 }
  if (selection?.kind === 'suite') return { kind: 'suite', suiteId: selection.suiteId }
  if (activeRequirement(state)) return { kind: 'list' }
  return { kind: 'empty' }
}

type FocusTarget = 'why' | 'list'

const FOCUS_SELECTOR: Record<FocusTarget, string> = {
  why: '[data-focus-target="why"]',
  list: '[data-focus-target="list"] button',
}

/**
 * Keeps keyboard focus in the panel when a click inside it swaps the content (match card → why, All matches or
 * Jump to date → list). The clicked control names the target in `data-focus-next`; nothing else moves focus,
 * so typing in the form or dragging the slider never loses it.
 */
function usePanelFocus() {
  const ref = useRef<HTMLElement>(null)
  const pending = useRef<FocusTarget | null>(null)
  const onClick = (e: MouseEvent) => {
    const next = e.target instanceof Element ? e.target.closest('[data-focus-next]')?.getAttribute('data-focus-next') : null
    if (next === 'why' || next === 'list') pending.current = next
  }
  useEffect(() => {
    if (!pending.current) return
    const target = ref.current?.querySelector<HTMLElement>(FOCUS_SELECTOR[pending.current])
    pending.current = null
    target?.focus()
  })
  return { panelRef: ref, onPanelClick: onClick }
}

export function RightPanel() {
  const { state, dispatch } = useAppState()
  const { matches } = useMatches()
  const view = panelView(state, matches)
  // A11: a match selection whose suites no longer form a current candidate (date move, Clear) is cleared.
  const stale = state.selection?.kind === 'match' && view.kind !== 'match'
  useEffect(() => {
    if (stale) dispatch({ type: 'select', selection: null })
  }, [stale, dispatch])
  const { panelRef, onPanelClick } = usePanelFocus()
  return (
    <aside ref={panelRef} onClick={onPanelClick} className={styles.panel} data-testid="right-panel" data-print="hide" aria-label="Details">
      {view.kind === 'match' && (
        <>
          <MatchWhy candidate={view.candidate} rank={view.rank} />
        </>
      )}
      {view.kind === 'suite' && (
        <>
          <SuiteDetails suiteId={view.suiteId} />
        </>
      )}
      {view.kind === 'list' && (
        <>
          <MatchList />
        </>
      )}
      {view.kind === 'empty' && (
        <p className={styles.empty} data-testid="right-empty">
          Enter a size to find space · click a suite for details
        </p>
      )}
    </aside>
  )
}
