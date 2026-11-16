import { activeRequirement } from '../../app/state/selectors'
import type { AppState, RequirementDraft, Selection } from '../../app/state/types'
import type { Candidate } from '../../domain/types'

// What the right drawer shows, and whether it is open. Pure: the drawer hook keeps the dismissal.

export type PanelView =
  | { kind: 'match'; candidate: Candidate; rank: number }
  | { kind: 'suite'; suiteId: string }
  | { kind: 'list' }
  | { kind: 'empty' }

/** Right panel precedence (spec-technical §4): match → suite → requirement → empty. A stale match falls through. */
export function panelView(state: AppState, matches: readonly Candidate[]): PanelView {
  const { selection } = state
  const index = selection?.kind === 'match' ? matches.findIndex((c) => c.key === selection.key) : -1
  const candidate = matches[index]
  if (candidate) return { kind: 'match', candidate, rank: index + 1 }
  if (selection?.kind === 'suite') return { kind: 'suite', suiteId: selection.suiteId }
  if (activeRequirement(state)) return { kind: 'list' }
  return { kind: 'empty' }
}

/**
 * The drawer was closed while the app showed this requirement and selection (by identity). It stays closed
 * until either changes: a new requirement, or a suite or match selected (every `select` makes a new object).
 */
export type Dismissal = { req: RequirementDraft; selection: Selection } | null

/** The dismissal for the state as it will be once the close has been handled (`selection` already applied). */
export function dismissalFor(state: Pick<AppState, 'req' | 'selection'>): Dismissal {
  return { req: state.req, selection: state.selection }
}

function dismissed(state: AppState, dismissal: Dismissal): boolean {
  return dismissal !== null && dismissal.req === state.req && dismissal.selection === state.selection
}

/** Open when there is something to show (a match, a suite, the list or no-fit) and it was not dismissed. */
export function rightDrawerOpen(state: AppState, matches: readonly Candidate[], dismissal: Dismissal): boolean {
  return panelView(state, matches).kind !== 'empty' && !dismissed(state, dismissal)
}

/** A stable identity for a view (`panelView` builds a new object on every render). */
export function viewKey(view: PanelView): string {
  if (view.kind === 'match') return `match:${view.candidate.key}:${view.rank}`
  if (view.kind === 'suite') return `suite:${view.suiteId}`
  return view.kind
}
