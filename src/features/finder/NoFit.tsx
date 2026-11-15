import { useAppState } from '../../app/state/useAppState'
import { formatMonthYear, formatNumber, formatSf } from '../../domain/format'
import type { Candidate, NoFit as NoFitResult, NoFitReason } from '../../domain/types'
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

const suitesText = (c: Candidate) =>
  c.suiteNumbers.length === 1 ? `Suite ${c.suiteNumbers[0]}` : `Suites ${c.suiteNumbers.join(' + ')}`

/** Why nothing fits on this date, and the way out: the earliest date a fit appears. */
export function NoFit({ noFit }: Props) {
  const { dispatch } = useAppState()
  const { reasons, earliestFit } = noFit
  return (
    <div className={styles.noFit} data-testid="no-fit">
      <h3 className={styles.title}>No matches on this date</h3>
      <ul className={styles.reasons}>
        {reasons.map((r) => <li key={r.kind} data-testid="no-fit-reason">{reasonText(r)}</li>)}
      </ul>
      {earliestFit ? (
        <div className={styles.way}>
          <p className={styles.earliest}>
            Earliest fit: <strong>{formatMonthYear(earliestFit.date)}</strong> — {suitesText(earliestFit.candidate)}
            {earliestFit.candidate.availability === 'potential' ? ' (potential)' : ''}.
          </p>
          <button
            type="button" className={styles.jump} data-testid="jump-to-date" data-focus-next="list"
            onClick={() => dispatch({ type: 'noFit/jump', asOf: earliestFit.date })}
          >
            Jump to date
          </button>
        </div>
      ) : (
        <p className={styles.horizon}>No fit in the next 5 years.</p>
      )}
    </div>
  )
}
