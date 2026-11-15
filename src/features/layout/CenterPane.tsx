import { Legend } from '../stack/Legend'
import { StackView } from '../stack/StackView'
import { DateSlider } from '../timeline/DateSlider'
import styles from './CenterPane.module.css'

export function CenterPane() {
  return (
    <section className={styles.pane} data-testid="center-pane" aria-label="Stacking plan">
      {/* slot:toolbar (S8) */}
      <div className={styles.card}>
        {/* slot:view-switch (S13) */}<StackView />
        <div className={styles.legendRow}>
          {/* slot:legend-switch (S8) */}<Legend />
        </div>
      </div>
      <DateSlider />
      {/* slot:scenario-bar (S11) */}
    </section>
  )
}
