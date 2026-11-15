import { LegendSwitch } from '../risk/LegendSwitch'
import { StackToolbar } from '../risk/StackToolbar'
import { ScenarioBar } from '../scenario/ScenarioBar'
import { StackView } from '../stack/StackView'
import { DateSlider } from '../timeline/DateSlider'
import styles from './CenterPane.module.css'

export function CenterPane() {
  return (
    <section className={styles.pane} data-testid="center-pane" aria-label="Stacking plan">
      <StackToolbar />
      <div className={styles.card}>
        {/* slot:view-switch (S13) */}<StackView />
        <div className={styles.legendRow}>
          <LegendSwitch />
        </div>
      </div>
      <DateSlider />
      <ScenarioBar />
    </section>
  )
}
