import { useId } from 'react'
import { useAppState } from '../../app/state/useAppState'
import type { AppState } from '../../app/state/types'
import { MAX_SHORTLIST } from '../../domain/constants'
import { suiteCandidate } from '../../domain/findFits'
import type { Candidate, Floor, ShortlistEntry, Suite } from '../../domain/types'
import { createEntry, entryId } from '../shortlist/entryId'
import styles from './details.module.css'

type Props = { floor: Floor; suite: Suite }

/** Where the suite stands for "Add to client summary": what the button says and why it cannot be pressed. */
type Standing = { candidate: Candidate | null; id: string; saved: boolean; label: string; blocked: string | undefined }

/** A saved option of two or more suites that already holds the suite, for the same building and date. */
function holdingOption(state: AppState, suiteId: string): ShortlistEntry | undefined {
  return state.shortlist.find((e) => e.buildingId === state.buildingId && e.asOf === state.asOf
    && e.candidate.suiteIds.length > 1 && e.candidate.suiteIds.includes(suiteId))
}

/** Why "Add to client summary" is unavailable, or undefined when it can be pressed. */
function blockedReason(state: AppState, p: Props, candidate: Candidate | null, held: ShortlistEntry | undefined): string | undefined {
  if (held) return `Already in the shortlisted option ${held.candidate.suiteNumbers.join(' + ')}`
  if (!candidate) {
    const asPotential = suiteCandidate(p.floor, p.suite, state.asOf, state.today, true)
    return asPotential ? 'Potential space is left out: Include potential space is off' : 'Only available space can go in the client summary'
  }
  const full = state.shortlist.filter((e) => e.buildingId === state.buildingId).length >= MAX_SHORTLIST
  return full ? `The shortlist holds ${MAX_SHORTLIST} options` : undefined
}

function standing(state: AppState, p: Props): Standing {
  const candidate = suiteCandidate(p.floor, p.suite, state.asOf, state.today, state.req.includePotential)
  const id = entryId(state.buildingId, state.asOf, p.suite.id, state.changes.length > 0)
  if (state.shortlist.some((e) => e.id === id)) return { candidate, id, saved: true, label: 'Remove from client summary', blocked: undefined }
  const held = holdingOption(state, p.suite.id)
  const label = held ? 'In shortlisted option' : 'Add to client summary'
  return { candidate, id, saved: false, label, blocked: blockedReason(state, p, candidate, held) }
}

/**
 * The suite's two actions. "Add to client summary" puts the suite on the shortlist (which the client summary
 * lists) as a one-suite option for the date on screen, or takes it off again; a suite already in a saved
 * multi-suite option is not added twice. When it cannot be pressed it stays focusable (aria-disabled) and the
 * reason is a visible line it is described by. "Floor plan" opens the 3D floor view on the suite's floor, from
 * the 2D stack too.
 */
export function DetailsActions({ floor, suite }: Props) {
  const { state, dispatch } = useAppState()
  const reasonId = useId()
  const s = standing(state, { floor, suite })
  const toggle = () => {
    if (s.blocked) return
    if (s.saved) dispatch({ type: 'shortlist/remove', id: s.id })
    else if (s.candidate) dispatch({ type: 'shortlist/add', entry: createEntry(state.buildingId, s.candidate, state.asOf, state.changes.length > 0) })
  }
  const openFloor = () => {
    dispatch({ type: 'view/set', view: '3d' })
    dispatch({ type: 'floor/set', floor: floor.number })
  }
  return (
    <div className={styles.actions}>
      <div className={styles.buttons}>
        <button type="button" className={styles.primary} data-testid="add-to-summary" data-saved={s.saved}
          aria-disabled={s.blocked ? true : undefined} aria-describedby={s.blocked ? reasonId : undefined} onClick={toggle}>
          {s.label}
        </button>
        <button type="button" className={styles.secondary} data-testid="open-floor-plan" onClick={openFloor}>
          Floor plan
        </button>
      </div>
      {s.blocked && <p id={reasonId} className={styles.reason} data-testid="add-to-summary-reason">{s.blocked}</p>}
    </div>
  )
}
