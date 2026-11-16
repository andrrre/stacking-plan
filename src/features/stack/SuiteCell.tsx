import type { CSSProperties } from 'react'
import { suiteDataAttributes } from './suiteAttributes'
import type { RovingItemProps } from './useRovingFocus'
import type { SuiteLabel, SuiteVisual } from './suiteVisual'
import styles from './stack.module.css'

// One suite: a toggle button sized by flex (spec-technical §5.6). Two lines: "number · SF" over the tenant or
// status in words; a compact (small) suite shows its number alone. Every word is also in the aria-label and
// the native tooltip, so the container-query tiers in stack.module.css may hide any of it.

function Label({ label }: { label: SuiteLabel }) {
  return (
    <span className={styles.label}>
      <span className={styles.line1}>
        <span className={styles.number}>{label.number}</span>
        {!label.compact && <span className={styles.sf}> · {label.sf}</span>}
      </span>
      {!label.compact && <span className={styles.line2}>{label.line2}</span>}
    </span>
  )
}

const MOVE_TAGS = { out: 'Moves out', in: 'Moves in' } as const

type Props = {
  visual: SuiteVisual
  roving: RovingItemProps
  joinsNext: boolean
  onSelect: (suiteId: string) => void
}

export function SuiteCell({ visual: v, roving, joinsNext, onSelect }: Props) {
  const style: CSSProperties = { flexGrow: v.suite.areaSf }
  return (
    <button
      type="button"
      className={styles.suite}
      style={style}
      data-testid={`suite-${v.suite.id}`}
      {...suiteDataAttributes(v, joinsNext)}
      data-compact={String(v.label.compact)}
      aria-pressed={v.selected}
      aria-label={v.ariaLabel}
      title={v.tooltip}
      onClick={() => onSelect(v.suite.id)}
      {...roving}
    >
      <Label label={v.label} />
      {v.move && <span className={styles.moveTag}>{MOVE_TAGS[v.move]}</span>}
      {v.modified && <span className={styles.modifiedDot} aria-hidden="true" />}
    </button>
  )
}
