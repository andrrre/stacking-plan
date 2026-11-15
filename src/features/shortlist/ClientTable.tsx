import { formatLongDate, formatNumber, formatPsf } from '../../domain/format'
import type { ClientOption } from './clientOptions'
import styles from './compare.module.css'

/** The comparison as the client reads it: asking rents and available-from dates only. */
export function ClientTable({ options }: { options: readonly ClientOption[] }) {
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
          <th scope="col">Notes</th>
        </tr>
      </thead>
      <tbody>
        {options.map((o) => (
          <tr key={o.rank} data-testid={`compare-row-${o.rank}`}>
            <th scope="row"><span className={styles.badge}>{o.rank}</span></th>
            <td className={styles.space}>{o.label}</td>
            <td>{o.floor}</td>
            <td className={styles.num}>{formatNumber(o.totalSf)} SF</td>
            <td className={styles.num}>{formatPsf(o.blendedRentPsf)}<span className={styles.unit}>/SF/yr</span></td>
            <td className={styles.date}>{formatLongDate(o.availableFrom)}</td>
            <td>
              {o.notes.length === 0 ? <span className={styles.none}>None</span> : (
                <ul className={styles.notes}>{o.notes.map((n) => <li key={n}>{n}</li>)}</ul>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
