import { useState } from 'react'
import { activeRequirement } from '../../app/state/selectors'
import { useAppState } from '../../app/state/useAppState'
import { StackToolbar } from '../risk/StackToolbar'
import { Legend } from '../stack/Legend'
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

/** A suite tour gives the stage the whole pane: the toolbar, legend, date slider and scenario bar wait until it ends. */
export function CenterPane() {
  const { state } = useAppState()
  const hint = useStageHint()
  const touring = state.tour !== null
  return (
    <section className={styles.pane} data-testid="center-pane" aria-label="Stacking plan">
      {!touring && <StackToolbar />}
      <div className={styles.card} data-view={state.view}>
        <div className={styles.stackArea}>
          <ViewSwitch />
          {hint && !touring && <p className={styles.hint} data-testid="stage-hint" data-print="hide">Click a suite for details · enter a size to find space</p>}
        </div>
        {!touring && (
          <div className={styles.legendRow}>
            <Legend />
          </div>
        )}
      </div>
      {!touring && <DateSlider />}
      {!touring && <ScenarioBar />}
    </section>
  )
}
