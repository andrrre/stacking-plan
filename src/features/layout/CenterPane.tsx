import { useState } from 'react'
import { activeRequirement } from '../../app/state/selectors'
import { useAppState } from '../../app/state/useAppState'
import { LegendSwitch } from '../risk/LegendSwitch'
import { StackToolbar } from '../risk/StackToolbar'
import { ScenarioBar } from '../scenario/ScenarioBar'
import { DateSlider } from '../timeline/DateSlider'
import { ViewSwitch } from '../three-d/ViewSwitch'
import styles from './CenterPane.module.css'

/**
 * The first-visit guidance (it used to fill the empty right panel): shown until anything is selected or
 * searched, then gone for good. Not in floor view, whose floor slider takes the stage's left edge.
 */
function useStageHint(): boolean {
  const { state } = useAppState()
  const busy = state.selection !== null || activeRequirement(state) !== null
  const [done, setDone] = useState(busy)
  if (busy && !done) setDone(true)
  return !done && state.floor === null
}

export function CenterPane() {
  const { state } = useAppState()
  const hint = useStageHint()
  return (
    <section className={styles.pane} data-testid="center-pane" aria-label="Stacking plan">
      <StackToolbar />
      <div className={styles.card} data-view={state.view}>
        <div className={styles.stackArea}>
          <ViewSwitch />
          {hint && <p className={styles.hint} data-testid="stage-hint" data-print="hide">Click a suite for details · enter a size to find space</p>}
        </div>
        <div className={styles.legendRow}>
          <LegendSwitch />
        </div>
      </div>
      <DateSlider />
      <ScenarioBar />
    </section>
  )
}
