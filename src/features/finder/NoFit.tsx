import { useAppState } from '../../app/state/useAppState'
import { formatMonthYear, formatNumber, formatSf, suitesLabel } from '../../domain/format'
import type { NoFit as NoFitResult, NoFitReason } from '../../domain/types'
import styles from './NoFit.module.css'

type Props = { noFit: NoFitResult }

const plural = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? '' : 's'}`

const LIMIT_WORDS = { maxSf: 'size', maxRentPsf: 'rent' } as const

/** spec.md A6 and spec-technical §5.4 copy. */
function reasonText(r: NoFitReason): string {
  switch (r.kind) {
    case 'nothingAvailable':
      return 'No space is available on this date.'
    case 'largestBlock':
      return `Largest block is ${formatSf(r.block.totalSf)} on floor ${r.block.floor}.`
    case 'spread':
      return `${formatSf(r.totalSf)} is available, but split into ${plural(r.blockCount, 'block')} on ${plural(r.floorCount, 'floor')}.`
    case 'filtered':
      return `Space this size exists above your maximum ${r.by.map((k) => LIMIT_WORDS[k]).join(' / ')}.`
  }
}

type EarliestFit = NonNullable<NoFitResult['earliestFit']>

/**
 * The way out. A fit on the date already shown can only be potential space with the toggle off (spec A6), so it
 * offers to include potential space; a later fit offers the jump. Both dispatch the jump, which turns the toggle on.
 */
function WayOut({ fit, onDate }: { fit: EarliestFit; onDate: boolean }) {
  const { dispatch } = useAppState()
  const suites = suitesLabel(fit.candidate.suiteNumbers)
  return (
    <div className={styles.way}>
      {onDate ? (
        <p className={styles.earliest}>{suites} fits on this date if you include potential space.</p>
      ) : (
        <p className={styles.earliest}>
          Earliest fit: <strong>{formatMonthYear(fit.date)}</strong> — {suites}
          {fit.candidate.availability === 'potential' ? ' (potential)' : ''}.
        </p>
      )}
      <button
        type="button" className={styles.jump} data-testid={onDate ? 'include-potential-fit' : 'jump-to-date'} data-focus-next="list"
        onClick={() => dispatch({ type: 'noFit/jump', asOf: fit.date })}
      >
        {onDate ? 'Include potential space' : 'Jump to date'}
      </button>
    </div>
  )
}

/** Why nothing fits on this date, and the way out: the earliest date a fit appears. */
export function NoFit({ noFit }: Props) {
  const { state } = useAppState()
  const { reasons, earliestFit } = noFit
  return (
    <div className={styles.noFit} data-testid="no-fit">
      <h3 className={styles.title}>No matches on this date</h3>
      <ul className={styles.reasons}>
        {reasons.map((r) => <li key={r.kind} data-testid="no-fit-reason">{reasonText(r)}</li>)}
      </ul>
      {earliestFit
        ? <WayOut fit={earliestFit} onDate={earliestFit.date === state.asOf} />
        : <p className={styles.horizon}>No fit in the next 5 years.</p>}
    </div>
  )
}
