import { useMemo } from 'react'
import { selectBuilding } from '../../app/state/selectBuilding'
import { useAppState } from '../../app/state/useAppState'
import { explainNoFit } from '../../domain/explainNoFit'
import { formatSf } from '../../domain/format'
import type { NoFit as NoFitResult } from '../../domain/types'
import { MatchCard } from './MatchCard'
import { NoFit } from './NoFit'
import { useMatches } from './useMatches'
import styles from './MatchList.module.css'

/** Ranked matches for the active requirement; the stack shows the same numbers on its outlines. */
export function MatchList() {
  const { state } = useAppState()
  const { req, matches } = useMatches()
  const building = selectBuilding(state)
  const { asOf, today } = state
  const noFit = useMemo((): NoFitResult | null => (req && matches.length === 0 ? explainNoFit(building, req, asOf, today) : null),
    [building, req, matches, asOf, today])
  if (!req) return null
  const count = matches.length === 1 ? '1 option' : `${matches.length} options`
  return (
    <section className={styles.list} data-testid="match-list" aria-labelledby="match-list-title">
      <header className={styles.head}>
        <h2 id="match-list-title" className={styles.title}>Matches</h2>
        <p className={styles.summary}>{count} for {formatSf(req.minSf)}+</p>
      </header>
      {noFit
        ? <NoFit noFit={noFit} />
        : <ol className={styles.items} data-focus-target="list">{matches.map((c, i) => <MatchCard key={c.key} candidate={c} rank={i + 1} />)}</ol>}
    </section>
  )
}
