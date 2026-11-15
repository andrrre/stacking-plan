import { useAppState } from '../../app/state/useAppState'
import { formatMonthYear, formatNumber, formatPsf, formatSf } from '../../domain/format'
import type { Candidate, ISODate } from '../../domain/types'
import styles from './MatchCard.module.css'

type Props = { candidate: Candidate; rank: number }

const suitesText = (c: Candidate) =>
  c.suiteNumbers.length === 1 ? `Suite ${c.suiteNumbers[0]}` : `Suites ${c.suiteNumbers.join(' + ')}`

/** "now" iff the space is free by today; a firm run freed later still reads "from MMM yyyy" (spec A5). */
const availabilityText = (c: Candidate, today: ISODate) =>
  c.availableFrom <= today ? 'Available now' : `From ${formatMonthYear(c.availableFrom)}`

export function MatchCard({ candidate: c, rank }: Props) {
  const { state, dispatch } = useAppState()
  const selected = state.selection?.kind === 'match' && state.selection.key === c.key
  const combined = c.suiteIds.length > 1
  return (
    <li className={styles.card} data-testid={`match-${rank}`} data-key={c.key} data-availability={c.availability}>
      <button
        type="button" className={styles.main} aria-pressed={selected} data-focus-next="why"
        onClick={() => dispatch({ type: 'select', selection: { kind: 'match', key: c.key } })}
      >
        <span className={styles.rank} aria-hidden="true">{rank}</span>
        <span className={styles.body}>
          <span className={styles.line}>
            <span className={styles.title}><span className={styles.sr}>Match {rank}:</span> {suitesText(c)}</span>
            <span className={styles.total}>{formatSf(c.totalSf)}</span>
          </span>
          <span className={styles.line}>
            <span className={styles.muted}>Floor {c.floor} · <span className={styles.num}>+{formatNumber(c.excessSf)} SF</span> over</span>
            <span className={styles.num}>{formatPsf(c.blendedRentPsf)}<span className={styles.unit}>/SF</span></span>
          </span>
          <span className={styles.tags}>
            <span className={styles.tag} data-tone={c.availableFrom <= state.today ? 'now' : 'later'}>{availabilityText(c, state.today)}</span>
            {c.availability === 'potential' && <span className={styles.tag} data-tone="potential">Potential</span>}
            {combined && <span className={styles.tag} data-tone="combined">{c.suiteIds.length} suites combined</span>}
          </span>
        </span>
      </button>
      {/* slot:save-match (S9) */}
    </li>
  )
}
