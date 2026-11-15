import styles from './LeftRail.module.css'

export function LeftRail() {
  return (
    <aside className={styles.rail} data-testid="left-rail" data-print="hide" aria-label="Requirement and shortlist">
      {/* slot:ask (S12) */}
      {/* slot:requirement (S5) */}
      {/* slot:shortlist (S9) */}
    </aside>
  )
}
