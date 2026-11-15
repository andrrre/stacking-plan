import { RequirementForm } from '../finder/RequirementForm'
import styles from './LeftRail.module.css'

export function LeftRail() {
  return (
    <aside className={styles.rail} data-testid="left-rail" data-print="hide" aria-label="Requirement and shortlist">
      {/* slot:ask (S12) */}
      <RequirementForm />
      {/* slot:shortlist (S9) */}
    </aside>
  )
}
