import { AskBox } from '../ask/AskBox'
import { RequirementForm } from '../finder/RequirementForm'
import { Shortlist } from '../shortlist/Shortlist'
import styles from './LeftRail.module.css'

export function LeftRail() {
  return (
    <aside className={styles.rail} data-testid="left-rail" data-print="hide" aria-label="Requirement and shortlist">
      <AskBox />
      <RequirementForm />
      <Shortlist />
    </aside>
  )
}
