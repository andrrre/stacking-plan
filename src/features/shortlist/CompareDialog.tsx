import { useAppState } from '../../app/state/useAppState'
import { CompareTable } from './CompareTable'
import { DialogFrame } from './DialogFrame'
import { useShortlist } from './useShortlist'
import styles from './dialog.module.css'

/** The shortlisted options side by side, for the broker (caveats name the tenant). */
export function CompareDialog() {
  const { dispatch } = useAppState()
  const entries = useShortlist()
  const close = () => dispatch({ type: 'overlay/set', overlay: 'none' })
  return (
    <div className={styles.backdrop}>
      <DialogFrame labelledBy="compare-title" onClose={close} className={styles.dialog}>
        <div data-testid="compare-dialog" className={styles.inner}>
          <header className={styles.head}>
            <h2 id="compare-title" className={styles.title}>Compare options</h2>
            <button type="button" className={styles.close} data-testid="compare-close" onClick={close}>Close</button>
          </header>
          <div className={styles.scroll}>
            <CompareTable entries={entries} />
          </div>
        </div>
      </DialogFrame>
    </div>
  )
}
