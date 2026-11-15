import type { ReactNode } from 'react'
import { useAppState } from '../../app/state/useAppState'
import { caveatText } from '../../domain/caveats'
import { formatLongDate, formatNumber, formatPsf, formatSf, suitesLabel } from '../../domain/format'
import type { Candidate } from '../../domain/types'
import { PlaceTenant } from '../scenario/PlaceTenant'
import styles from './MatchWhy.module.css'

type Props = { candidate: Candidate; rank: number }

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** "Why this works" for a selected match (DESIGN §6.3): suites, SF, excess, blended asking rent, free date, caveats. */
export function MatchWhy({ candidate: c, rank }: Props) {
  const { state, dispatch } = useAppState()
  const combined = c.suiteIds.length > 1
  const minSf = c.totalSf - c.excessSf
  return (
    <section className={styles.why} data-testid="match-why" data-key={c.key} aria-labelledby="match-why-title">
      <button type="button" className={styles.back} data-focus-next="list" onClick={() => dispatch({ type: 'select', selection: null })}>
        <span aria-hidden="true">←</span> All matches
      </button>
      <header className={styles.head}>
        <span className={styles.rank} aria-hidden="true">{rank}</span>
        <div>
          <p className={styles.kicker}>Why this works · match {rank}</p>
          <h2 id="match-why-title" className={styles.title} tabIndex={-1} data-focus-target="why">{suitesLabel(c.suiteNumbers)}</h2>
          <p className={styles.where}>Floor {c.floor}{combined ? ` · ${c.suiteIds.length} suites combined` : ''}</p>
        </div>
      </header>
      <dl className={styles.rows}>
        <Row label="Total">{formatSf(c.totalSf)}</Row>
        <Row label="Excess">+{formatNumber(c.excessSf)} SF <span className={styles.unit}>over {formatSf(minSf)} min</span></Row>
        <Row label={combined ? 'Blended asking' : 'Asking rent'}>
          {formatPsf(c.blendedRentPsf)} <span className={styles.unit}>/SF/yr</span>
        </Row>
        <Row label="Available">
          {c.availableFrom <= state.today ? 'Now' : `From ${formatLongDate(c.availableFrom)}`}
          {c.availability === 'potential' && <span className={styles.potential}>Potential</span>}
        </Row>
      </dl>
      <div>
        <h3 className={styles.sub}>Caveats</h3>
        {c.caveats.length === 0
          ? <p className={styles.clear}>No caveats: every suite is free without assumptions.</p>
          : (
            <ul className={styles.caveats}>
              {c.caveats.map((cv, i) => <li key={i} data-testid="match-why-caveat">{caveatText(cv, 'broker')}</li>)}
            </ul>
          )}
      </div>
      <PlaceTenant candidate={c} />
    </section>
  )
}
