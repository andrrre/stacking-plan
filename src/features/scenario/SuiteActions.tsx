import { useState } from 'react'
import type { Change, ISODate, Lease, StatusResult, Suite } from '../../domain/types'
import { shownLease } from '../details/suiteFacts'
import { ChangeDialog } from './ChangeDialog'
import { leaseChange, renewChange, vacateChange } from './changeDefaults'
import styles from './scenario.module.css'

type Props = { suite: Suite; st: StatusResult; asOf: ISODate }

/** The lease a broker can renew or vacate: the active one, or the one that just ended on potential space (DESIGN §6.5). */
function actionableLease(st: StatusResult): Lease | null {
  if (st.status === 'vacant' && st.overlay === 'potential') return st.endedLease
  return shownLease(st)
}

/** Scenario actions in the suite details: renew, vacate, lease to a prospect. */
export function SuiteActions({ suite, st, asOf }: Props) {
  const [draft, setDraft] = useState<Change | null>(null)
  if (suite.kind !== 'leasable') return null
  const lease = actionableLease(st)
  const renew = lease ? renewChange(lease) : null

  return (
    <div className={styles.actions}>
      <h3 className={styles.sub}>What if</h3>
      <div className={styles.buttons}>
        {lease && (
          <button type="button" className={styles.action} data-testid="action-renew" disabled={renew === null}
            title={renew === null ? 'No end date: an open-ended lease cannot be renewed' : undefined}
            onClick={() => setDraft(renew)}>
            Renew
          </button>
        )}
        {lease && (
          <button type="button" className={styles.action} data-testid="action-vacate" onClick={() => setDraft(vacateChange(lease, asOf))}>
            Vacate
          </button>
        )}
        {st.status === 'vacant' && (
          <button type="button" className={styles.action} data-testid="action-lease" onClick={() => setDraft(leaseChange(suite, asOf))}>
            Lease to prospect
          </button>
        )}
      </div>
      {draft && <ChangeDialog initial={draft} onClose={() => setDraft(null)} />}
    </div>
  )
}
