import type { CSSProperties, ReactNode } from 'react'
import styles from './stack.module.css'

type Props = { rank: number; areaSf: number; suiteCount: number; children: ReactNode }

/**
 * Wraps the suites of one ranked match on a floor: a ring plus a numbered badge (the non-colour match cue).
 * It takes the run's combined flex share, so the suites inside keep their proportional widths.
 */
export function MatchOutline({ rank, areaSf, suiteCount, children }: Props) {
  const style: CSSProperties = {
    flexGrow: areaSf,
    minWidth: `calc(${suiteCount} * var(--suite-min-w) + ${suiteCount - 1} * var(--suite-gap))`,
  }
  return (
    <div className={styles.run} style={style} data-testid={`match-outline-${rank}`}>
      <span className={styles.runBadge} aria-hidden="true">{rank}</span>
      {children}
    </div>
  )
}
