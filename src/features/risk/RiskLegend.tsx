import type { FillKey } from '../stack/suiteVisual'
import { LockGlyph } from '../stack/SuiteCell'
import stack from '../stack/stack.module.css'

type Entry = { fill: FillKey; label: string }

// Same fill keys as the stack cells, so the swatches use the same tokens and cannot drift.
const RISK: Entry[] = [
  { fill: 'vacant', label: 'Vacant' },
  { fill: 'risk-le6', label: '≤ 6 months' },
  { fill: 'risk-le12', label: '≤ 12 months' },
  { fill: 'risk-le24', label: '≤ 24 months' },
  { fill: 'risk-le36', label: '≤ 36 months' },
  { fill: 'risk-gt36', label: 'Over 36 months' },
  { fill: 'risk-open', label: 'No end date' },
]

const OVERLAYS: Entry[] = [
  { fill: 'potential', label: 'Potential (lease ends, not renewed)' },
  { fill: 'committed', label: 'Committed (signed, starts later)' },
]

function Item({ entry, testId }: { entry: Entry; testId: string }) {
  return (
    <li className={stack.legendItem} data-testid={testId}>
      <span className={stack.swatch} data-fill={entry.fill} aria-hidden="true">
        {entry.fill === 'committed' ? <LockGlyph /> : null}
      </span>
      {entry.label}
    </li>
  )
}

export function RiskLegend() {
  return (
    <div className={stack.legend} data-testid="legend-risk">
      <ul className={stack.legendGroup} aria-label="Months to lease end">
        {RISK.map((e) => <Item key={e.fill} entry={e} testId="legend-risk-entry" />)}
      </ul>
      <ul className={stack.legendGroup} aria-label="Vacant space overlays">
        {OVERLAYS.map((e) => <Item key={e.fill} entry={e} testId="legend-risk-overlay" />)}
      </ul>
    </div>
  )
}
