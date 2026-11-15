import { LegendSwitch } from '../risk/LegendSwitch'
import { StackToolbar } from '../risk/StackToolbar'
import { ScenarioBar } from '../scenario/ScenarioBar'
import { DateSlider } from '../timeline/DateSlider'
import { ViewSwitch } from '../three-d/ViewSwitch'
import styles from './CenterPane.module.css'

export function CenterPane() {
  return (
    <section className={styles.pane} data-testid="center-pane" aria-label="Stacking plan">
      <StackToolbar />
      <div className={styles.card}>
        <ViewSwitch />
        <div className={styles.legendRow}>
          <LegendSwitch />
        </div>
      </div>
      <DateSlider />
      <ScenarioBar />
    </section>
  )
}
