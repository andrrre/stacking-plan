import { useAppState } from '../../app/state/useAppState'
import { MAX_SHORTLIST } from '../../domain/constants'
import type { Candidate } from '../../domain/types'
import { createEntry, entryId } from './entryId'
import styles from './save.module.css'

type Props = { candidate: Candidate; rank: number }

/** Saves a frozen snapshot of the match for the date on screen; "what-if" when a scenario is active. */
export function SaveMatch({ candidate, rank }: Props) {
  const { state, dispatch } = useAppState()
  const whatIf = state.changes.length > 0
  const id = entryId(state.buildingId, state.asOf, candidate.key, whatIf)
  const saved = state.shortlist.some((e) => e.id === id)
  const full = !saved && state.shortlist.filter((e) => e.buildingId === state.buildingId).length >= MAX_SHORTLIST
  return (
    <button
      type="button" className={styles.save} data-testid={`save-match-${rank}`} data-saved={saved} disabled={full}
      title={full ? `The shortlist holds ${MAX_SHORTLIST} options` : undefined}
      onClick={() => dispatch({ type: 'shortlist/add', entry: createEntry(state.buildingId, candidate, state.asOf, whatIf) })}
    >
      {saved ? '✓ Saved to shortlist' : full ? 'Shortlist full' : 'Save to shortlist'}
      <span className={styles.sr}> (match {rank})</span>
    </button>
  )
}
