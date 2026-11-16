import { useAppState } from '../../app/state/useAppState'
import { MAX_SHORTLIST } from '../../domain/constants'
import { suiteCandidate } from '../../domain/findFits'
import type { Floor, Suite } from '../../domain/types'
import { createEntry, entryId } from '../shortlist/entryId'
import styles from './details.module.css'

type Props = { floor: Floor; suite: Suite }

/** Why "Add to client summary" is unavailable, or undefined when it can be pressed. */
function blockedReason(available: boolean, saved: boolean, full: boolean): string | undefined {
  if (saved) return undefined
  if (!available) return 'Only available space can go in the client summary'
  return full ? `The shortlist holds ${MAX_SHORTLIST} options` : undefined
}

/**
 * The suite's two actions. "Add to client summary" puts the suite on the shortlist (which the client summary
 * lists) as a one-suite option for the date on screen, or takes it off again; "Floor plan" opens the 3D floor
 * view on the suite's floor, from the 2D stack too.
 */
export function DetailsActions({ floor, suite }: Props) {
  const { state, dispatch } = useAppState()
  const whatIf = state.changes.length > 0
  const candidate = suiteCandidate(floor, suite, state.asOf, state.today)
  const id = entryId(state.buildingId, state.asOf, suite.id, whatIf)
  const saved = state.shortlist.some((e) => e.id === id)
  const full = state.shortlist.filter((e) => e.buildingId === state.buildingId).length >= MAX_SHORTLIST
  const blocked = blockedReason(candidate !== null, saved, full)
  const toggle = () => {
    if (saved) dispatch({ type: 'shortlist/remove', id })
    else if (candidate) dispatch({ type: 'shortlist/add', entry: createEntry(state.buildingId, candidate, state.asOf, whatIf) })
  }
  const openFloor = () => {
    dispatch({ type: 'view/set', view: '3d' })
    dispatch({ type: 'floor/set', floor: floor.number })
  }
  return (
    <div className={styles.buttons}>
      <button type="button" className={styles.primary} data-testid="add-to-summary" data-saved={saved}
        disabled={blocked !== undefined} title={blocked} onClick={toggle}>
        {saved ? 'Remove from client summary' : 'Add to client summary'}
      </button>
      <button type="button" className={styles.secondary} data-testid="open-floor-plan" onClick={openFloor}>
        Floor plan
      </button>
    </div>
  )
}
