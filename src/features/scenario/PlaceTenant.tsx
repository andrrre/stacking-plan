import { useState } from 'react'
import { useAppState } from '../../app/state/useAppState'
import type { Candidate } from '../../domain/types'
import { ChangeDialog } from './ChangeDialog'
import { placeTenantChange } from './changeDefaults'
import { focusDetailsNext } from './detailsFocus'
import styles from './scenario.module.css'

type Props = { candidate: Candidate }

/**
 * "Place tenant here" on a match (DESIGN §6.5). Once placed the match no longer exists, so the placed suite is
 * selected: the details then show the prospect's lease on the scenario building, and take focus.
 */
export function PlaceTenant({ candidate }: Props) {
  const { state, dispatch } = useAppState()
  const [open, setOpen] = useState(false)
  const onClose = (applied: boolean) => {
    setOpen(false)
    const suiteId = candidate.suiteIds[0]
    if (!applied || suiteId === undefined) return
    focusDetailsNext(suiteId)
    dispatch({ type: 'select', selection: { kind: 'suite', suiteId } })
  }
  return (
    <>
      <button type="button" className={styles.place} data-testid="place-tenant" onClick={() => setOpen(true)}>
        Place tenant here
      </button>
      {open && <ChangeDialog initial={placeTenantChange(candidate, state.asOf)} onClose={onClose} />}
    </>
  )
}
