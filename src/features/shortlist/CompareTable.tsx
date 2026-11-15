import { formatLongDate, formatNumber, formatPsf, suitesLabel } from '../../domain/format'
import type { ShortlistEntry } from '../../domain/types'
import { optionNotes } from './optionNotes'
import styles from './compare.module.css'

/** The broker's comparison, one row per option numbered as on the stack. Caveats name the tenant. */
export function CompareTable({ entries }: { entries: readonly ShortlistEntry[] }) {
  return (
    <table className={styles.table} data-testid="compare-table">
      <caption className={styles.caption}>Options compared</caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Space</th>
          <th scope="col">Floor</th>
          <th scope="col" className={styles.num}>Size</th>
          <th scope="col" className={styles.num}>Asking rent</th>
          <th scope="col">Available from</th>
          <th scope="col">Saved for</th>
          <th scope="col">Notes</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e, i) => {
          const c = e.candidate
          const notes = optionNotes(e, 'broker')
          return (
            <tr key={e.id} data-testid={`compare-row-${i + 1}`}>
              <th scope="row"><span className={styles.badge}>{i + 1}</span></th>
              <td className={styles.space}>
                {suitesLabel(c.suiteNumbers)}
                {e.whatIf && <span className={styles.whatIf}>What-if</span>}
              </td>
              <td>{c.floor}</td>
              <td className={styles.num}>{formatNumber(c.totalSf)} SF</td>
              <td className={styles.num}>{formatPsf(c.blendedRentPsf)}<span className={styles.unit}>/SF/yr</span></td>
              <td className={styles.date}>{formatLongDate(c.availableFrom)}</td>
              <td className={styles.date}>{formatLongDate(e.asOf)}</td>
              <td>
                {notes.length === 0 ? <span className={styles.none}>None</span> : (
                  <ul className={styles.notes}>{notes.map((n) => <li key={n}>{n}</li>)}</ul>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
