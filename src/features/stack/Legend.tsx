import type { ReactNode } from 'react'
import type { FillKey } from './suiteVisual'
import { ClockGlyph, LockGlyph } from './SuiteCell'
import styles from './stack.module.css'

type Entry = { fill: FillKey; label: string; glyph?: ReactNode }

// Swatches reuse the suite fill rules (data-fill), so the legend can never drift from the stack.
const AVAILABILITY: Entry[] = [
  { fill: 'occupied', label: 'Occupied' },
  { fill: 'expiring', label: 'Expiring ≤12 mo', glyph: <ClockGlyph /> },
  { fill: 'vacant', label: 'Vacant' },
  { fill: 'common', label: 'Common area' },
]

const OVERLAYS: Entry[] = [
  { fill: 'potential', label: 'Potential (lease ends, not renewed)' },
  { fill: 'committed', label: 'Committed (signed, starts later)', glyph: <LockGlyph /> },
]

function Item({ entry, testId }: { entry: Entry; testId: string }) {
  return (
    <li className={styles.legendItem} data-testid={testId}>
      <span className={styles.swatch} data-fill={entry.fill} aria-hidden="true">{entry.glyph}</span>
      {entry.label}
    </li>
  )
}

export function Legend() {
  return (
    <div className={styles.legend} data-testid="legend">
      <ul className={styles.legendGroup} aria-label="Availability colours">
        {AVAILABILITY.map((e) => <Item key={e.fill} entry={e} testId="legend-entry" />)}
      </ul>
      <ul className={styles.legendGroup} aria-label="Vacant space overlays">
        {OVERLAYS.map((e) => <Item key={e.fill} entry={e} testId="legend-overlay" />)}
      </ul>
      <p className={styles.legendNote} data-testid="legend-assumption">
        A lease that ends is assumed not renewed: shown as potential
      </p>
    </div>
  )
}
