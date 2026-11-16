import { AskBox } from '../ask/AskBox'
import { RequirementForm } from '../finder/RequirementForm'
import { Shortlist } from '../shortlist/Shortlist'
import type { LeftDrawer } from './useDrawers'
import styles from './LeftRail.module.css'

const RAIL_ID = 'left-rail'

function Chevron() {
  return (
    <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function toggleName(open: boolean, count: number): string {
  if (open) return 'Hide search panel'
  return count > 0 ? `Show search panel (${count} in shortlist)` : 'Show search panel'
}

/**
 * The left drawer: requirement and shortlist. Its handle stays on the stage's left edge when it is closed; the
 * closed content is inert (out of the tab order and the accessibility tree). The badge counts the shortlist.
 */
export function LeftRail({ open, count, onToggle, onFocusWithin }: LeftDrawer) {
  return (
    <div className={styles.drawer} data-drawer="left" data-open={String(open)} data-print="hide" onFocus={() => onFocusWithin(true)}
      onBlur={(e) => { if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) onFocusWithin(false) }}>
      <div className={styles.clip}>
        <aside id={RAIL_ID} className={styles.rail} data-testid="left-rail" aria-label="Requirement and shortlist" inert={!open}>
          <AskBox />
          <RequirementForm />
          <Shortlist />
        </aside>
      </div>
      <button
        type="button" className={styles.handle} data-testid="left-drawer-toggle" onClick={onToggle}
        aria-expanded={open} aria-controls={RAIL_ID} aria-label={toggleName(open, count)} title={toggleName(open, count)}
      >
        <Chevron />
        {!open && count > 0 && <span className={styles.badge} data-testid="left-drawer-badge" aria-hidden="true">{count}</span>}
      </button>
    </div>
  )
}
