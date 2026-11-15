import { useAppState } from '../../app/state/useAppState'
import { formatLongDate, formatNumber, formatPsf, suitesLabel } from '../../domain/format'
import { useShortlist } from './useShortlist'
import styles from './shortlist.module.css'

/** The entries saved for this building: frozen snapshots, each removable, with the compare entry point. */
export function Shortlist() {
  const { dispatch } = useAppState()
  const entries = useShortlist()
  return (
    <section className={styles.shortlist} data-testid="shortlist" aria-labelledby="shortlist-title">
      <header className={styles.head}>
        <h2 id="shortlist-title" className={styles.title}>Shortlist <span className={styles.count}>({entries.length})</span></h2>
        {entries.length > 0 && (
          <button type="button" className={styles.compare} data-testid="open-compare" onClick={() => dispatch({ type: 'overlay/set', overlay: 'compare' })}>
            Compare
          </button>
        )}
      </header>
      {entries.length === 0 ? (
        <p className={styles.empty}>Save a match to build a shortlist for your client.</p>
      ) : (
        <ol className={styles.items}>
          {entries.map((e, i) => (
            <li key={e.id} className={styles.entry} data-testid={`shortlist-entry-${i + 1}`}>
              <span className={styles.rank} aria-hidden="true">{i + 1}</span>
              <div className={styles.body}>
                <p className={styles.line}>
                  <span className={styles.name}>{suitesLabel(e.candidate.suiteNumbers)}</span>
                  <span className={styles.num}>{formatNumber(e.candidate.totalSf)} SF</span>
                </p>
                <p className={styles.meta}>
                  Floor {e.candidate.floor} · {formatPsf(e.candidate.blendedRentPsf)}/SF
                </p>
                <p className={styles.meta}>From {formatLongDate(e.candidate.availableFrom)}</p>
                <p className={styles.meta}>
                  Saved for {formatLongDate(e.asOf)}
                  {e.whatIf && <span className={styles.whatIf} data-testid="whatif-tag">What-if</span>}
                </p>
              </div>
              <button
                type="button" className={styles.remove} data-testid={`shortlist-remove-${i + 1}`}
                aria-label={`Remove ${suitesLabel(e.candidate.suiteNumbers)}`}
                onClick={() => dispatch({ type: 'shortlist/remove', id: e.id })}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
