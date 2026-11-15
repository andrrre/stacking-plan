import { formatSf } from '../../domain/format'
import { MatchCard } from './MatchCard'
import { useMatches } from './useMatches'
import styles from './MatchList.module.css'

/** Ranked matches for the active requirement; the stack shows the same numbers on its outlines. */
export function MatchList() {
  const { req, matches } = useMatches()
  if (!req) return null
  const count = matches.length === 1 ? '1 option' : `${matches.length} options`
  return (
    <section className={styles.list} data-testid="match-list" aria-labelledby="match-list-title">
      <header className={styles.head}>
        <h2 id="match-list-title" className={styles.title}>Matches</h2>
        <p className={styles.summary}>{count} for {formatSf(req.minSf)}+</p>
      </header>
      {matches.length === 0
        ? <p className={styles.none}>No matches</p>
        : <ol className={styles.items}>{matches.map((c, i) => <MatchCard key={c.key} candidate={c} rank={i + 1} />)}</ol>}
    </section>
  )
}
