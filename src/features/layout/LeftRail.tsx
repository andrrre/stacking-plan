import { Assistant } from '../chat/Assistant'
import { RequirementForm } from '../finder/RequirementForm'
import { Shortlist } from '../shortlist/Shortlist'
import type { LeftDrawer } from './useDrawers'
import styles from './LeftRail.module.css'

const RAIL_ID = 'left-rail'

/** The sign that the panel behind the handle has the AI assistant: a large four-point spark and a small one. */
function Spark() {
  return (
    <svg className={styles.spark} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path className={styles.sparkBig} d="M6.5 2.5c.4 2.6 1.4 3.6 4 4-2.6.4-3.6 1.4-4 4-.4-2.6-1.4-3.6-4-4 2.6-.4 3.6-1.4 4-4Z" fill="currentColor" />
      <path className={styles.sparkSmall} d="M12 9.5c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2Z" fill="currentColor" />
    </svg>
  )
}

function toggleName(open: boolean, count: number): string {
  if (open) return 'Hide search panel'
  return count > 0 ? `Show search panel (${count} in shortlist)` : 'Show search panel'
}

/**
 * The left drawer: the assistant, the requirement form and the shortlist. Its handle stays on the stage's left edge when it is closed; the
 * closed content is inert (out of the tab order and the accessibility tree). The spark marks the AI assistant inside;
 * the badge counts the shortlist.
 */
export function LeftRail({ open, count, onToggle, onFocusWithin }: LeftDrawer) {
  return (
    <div className={styles.drawer} data-drawer="left" data-open={String(open)} data-print="hide" onFocus={() => onFocusWithin(true)}
      onBlur={(e) => { if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) onFocusWithin(false) }}>
      <div className={styles.clip}>
        <aside id={RAIL_ID} className={styles.rail} data-testid="left-rail" aria-label="Requirement and shortlist" inert={!open}>
          <Assistant />
          <RequirementForm />
          <Shortlist />
        </aside>
      </div>
      <button
        type="button" className={styles.handle} data-testid="left-drawer-toggle" onClick={onToggle}
        aria-expanded={open} aria-controls={RAIL_ID} aria-label={toggleName(open, count)} title={toggleName(open, count)}
      >
        <Spark />
        {!open && count > 0 && <span className={styles.badge} data-testid="left-drawer-badge" aria-hidden="true">{count}</span>}
      </button>
    </div>
  )
}
