import type { CSSProperties } from 'react'
import { suiteDataAttributes } from './suiteAttributes'
import type { RovingItemProps } from './useRovingFocus'
import type { SuiteCue, SuiteLabel, SuiteVisual } from './suiteVisual'
import styles from './stack.module.css'

// One suite: a toggle button sized by flex (spec-technical §5.6). Every word on it is also in the
// aria-label and the native tooltip, so the container-query tiers in stack.module.css may hide any of it.

export function ClockGlyph() {
  return (
    <svg className={styles.glyph} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <circle cx="6" cy="6" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 3.4V6l1.8 1.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function LockGlyph() {
  return (
    <svg className={styles.glyph} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <rect x="2.25" y="5.25" width="7.5" height="5.5" rx="1" fill="currentColor" />
      <path d="M4 5.25V4a2 2 0 0 1 4 0v1.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function Cue({ cue }: { cue: SuiteCue }) {
  return (
    <span className={styles.cue}>
      {cue.glyph === 'lock' ? <LockGlyph /> : <ClockGlyph />}
      <span className={styles.cueText}>{cue.text}</span>
    </span>
  )
}

/** Top line, in priority order: cue (glyph + MM/YYYY) · number · SF · end · tag. What does not fit wraps out of sight. */
function MetaLine({ label }: { label: SuiteLabel }) {
  return (
    <span className={styles.meta}>
      {label.cue && <Cue cue={label.cue} />}
      <span className={styles.number}>{label.number}</span>
      <span className={styles.sf}>{label.sf}</span>
      {label.end && <span className={styles.end}>{label.end}</span>}
      {label.tag && <span className={styles.tag}>{label.tag}</span>}
    </span>
  )
}

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
      aria-pressed={v.selected}
      aria-label={v.ariaLabel}
      title={v.tooltip}
      onClick={() => onSelect(v.suite.id)}
      {...roving}
    >
      <span className={styles.label}>
        <MetaLine label={v.label} />
        <span className={styles.primary}>
          {v.label.primary}
          {v.label.reason && <span className={styles.reason}> · {v.label.reason}</span>}
        </span>
      </span>
      {v.modified && <span className={styles.modifiedDot} aria-hidden="true" />}
    </button>
  )
}
