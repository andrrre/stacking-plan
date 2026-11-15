import { selectBaseBuilding } from '../../app/state/selectors'
import { useAppState } from '../../app/state/useAppState'
import { formatLongDate } from '../../domain/format'
import { ClientTable } from './ClientTable'
import { clientOptions } from './clientOptions'
import { DialogFrame } from './DialogFrame'
import { MiniStack } from './MiniStack'
import { useShortlist } from './useShortlist'
import styles from './summary.module.css'

/**
 * The page a broker sends: building, a layout-only mini stack with the options outlined, the comparison
 * (asking rents, available-from dates, client-worded caveats). It renders outside the app shell, which
 * the print CSS hides while overlay = 'summary'. Nothing here reads a lease or a tenant.
 */
export function ClientSummary() {
  const { state, dispatch } = useAppState()
  const options = clientOptions(useShortlist())
  const building = selectBaseBuilding(state)
  const close = () => dispatch({ type: 'overlay/set', overlay: 'none' })
  return (
    <div className={styles.backdrop}>
      <DialogFrame labelledBy="client-summary-title" onClose={close} className={styles.page}>
        <div data-testid="client-summary" className={styles.sheet}>
          <div className={styles.toolbar} data-print="hide">
            <button type="button" className={styles.primary} data-testid="summary-print" onClick={() => window.print()}>Print or save as PDF</button>
            <button type="button" className={styles.button} data-testid="summary-close" onClick={close}>Close</button>
          </div>
          <header className={styles.head}>
            <p className={styles.kicker}>Space shortlist</p>
            <h2 id="client-summary-title" className={styles.title}>{building.name}</h2>
            {building.address && <p className={styles.address}>{building.address}</p>}
            <p className={styles.prepared}>Prepared {formatLongDate(state.today)}</p>
          </header>
          {/* slot:summary-intro (S15) */}
          <section className={styles.section} aria-labelledby="summary-stack-title">
            <h3 id="summary-stack-title" className={styles.sub}>Where the options sit</h3>
            <MiniStack building={building} options={options} />
          </section>
          <section className={styles.section} aria-labelledby="summary-table-title">
            <h3 id="summary-table-title" className={styles.sub}>The options</h3>
            <ClientTable options={options} />
            <p className={styles.foot}>Asking rents are per square foot per year. Each option shows the date it becomes available.</p>
          </section>
        </div>
      </DialogFrame>
    </div>
  )
}
