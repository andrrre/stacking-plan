import { activeRequirement } from '../../app/state/selectors'
import type { AppState } from '../../app/state/types'
import { useAppState } from '../../app/state/useAppState'
import { SuiteDetails } from '../details/SuiteDetails'
import { MatchList } from '../finder/MatchList'
import styles from './RightPanel.module.css'

type PanelView =
  | { kind: 'match'; key: string }
  | { kind: 'suite'; suiteId: string }
  | { kind: 'list' }
  | { kind: 'empty' }

/** Right panel precedence (spec-technical §4): match → suite → requirement → empty. */
function panelView(state: AppState): PanelView {
  const { selection } = state
  if (selection?.kind === 'match') return { kind: 'match', key: selection.key }
  if (selection?.kind === 'suite') return { kind: 'suite', suiteId: selection.suiteId }
  if (activeRequirement(state)) return { kind: 'list' }
  return { kind: 'empty' }
}

export function RightPanel() {
  const { state } = useAppState()
  const view = panelView(state)
  return (
    <aside className={styles.panel} data-testid="right-panel" data-print="hide" aria-label="Details">
      {view.kind === 'match' && (
        <>
          {/* slot:match-why (S7) */}<MatchList />
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
