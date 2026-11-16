import { useAppState } from '../../app/state/useAppState'
import { legendEntries, legendMeta, type LegendEntry } from './legendEntries'
import { useStackModel } from './useStackModel'
import styles from './stack.module.css'

// The legend is also the filter: a pill per fill the colour mode paints, with its suite count and space as of
// the date shown. Pressing one dims every suite painted otherwise (2D and 3D); pressing it again clears.
// Swatches reuse the suite fill rules (data-fill), so the legend can never drift from the building.

// A pill with no suites is aria-disabled, not disabled: un-pressing a pill whose suites are gone (the date moved)
// keeps keyboard focus on it instead of dropping it to the page.
function Pill({ entry, pressed, onToggle }: { entry: LegendEntry; pressed: boolean; onToggle: () => void }) {
  const inert = entry.count === 0 && !pressed
  return (
    <button
      type="button" className={styles.pill} data-testid="legend-pill" data-key={entry.key} aria-pressed={pressed}
      aria-disabled={inert || undefined} onClick={inert ? undefined : onToggle}
    >
      <span className={styles.swatch} data-fill={entry.key} aria-hidden="true" />
      <span className={styles.pillName}>{entry.label}</span>
      <span className={styles.pillMeta}>{legendMeta(entry.count, entry.sf)}</span>
    </button>
  )
}

export function Legend() {
  const { state, dispatch } = useAppState()
  const model = useStackModel()
  const risk = state.mode === 'risk'
  return (
    <div className={styles.legend} data-testid={risk ? 'legend-risk' : 'legend'}>
      <div className={styles.pills} role="group" aria-label={risk ? 'Lease risk legend: show only' : 'Availability legend: show only'}>
        {legendEntries(model, state.mode).map((e) => (
          <Pill key={e.key} entry={e} pressed={state.legend === e.key} onToggle={() => dispatch({ type: 'legend/toggle', key: e.key })} />
        ))}
        <p className={styles.legendNote} data-testid="legend-assumption">
          A lease that ends is assumed not renewed: shown as potential
        </p>
      </div>
    </div>
  )
}
