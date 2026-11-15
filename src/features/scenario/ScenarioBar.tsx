import { useMemo } from 'react'
import { selectBuilding } from '../../app/state/selectBuilding'
import { selectBaseBuilding } from '../../app/state/selectors'
import { useAppState } from '../../app/state/useAppState'
import { formatMoney, formatNumber, formatSf } from '../../domain/format'
import { kpis } from '../../domain/kpis'
import styles from './ScenarioBar.module.css'

const pct = (p: number | null) => (p === null ? '—' : `${formatNumber(Math.round(p))}%`)

function signedMoney(d: number): { text: string; dir: 'up' | 'down' | 'flat' } {
  if (d === 0) return { text: `±${formatMoney(0)}`, dir: 'flat' }
  return d > 0 ? { text: `+${formatMoney(d)}`, dir: 'up' } : { text: `−${formatMoney(-d)}`, dir: 'down' }
}

function Metric({ label, before, after, testId, delta }: {
  label: string; before: string; after: string; testId: string; delta?: ReturnType<typeof signedMoney>
}) {
  return (
    <div className={styles.metric}>
      <dt>{label}</dt>
      <dd data-testid={testId}>
        <span className={styles.before}>{before}</span> <span className={styles.arrow}>→</span> <strong>{after}</strong>
        {delta && <> <span className={styles.delta} data-dir={delta.dir}>{delta.text}</span></>}
      </dd>
    </div>
  )
}

/** Change count and base@D → scenario@D for occupancy, vacant SF and rent roll (A8); shown while a scenario exists. */
export function ScenarioBar() {
  const { state, dispatch } = useAppState()
  const base = selectBaseBuilding(state)
  const building = selectBuilding(state)
  const { asOf, today, changes } = state
  const includePotential = state.req.includePotential
  const [before, after] = useMemo(
    () => [kpis(base, asOf, today, includePotential), kpis(building, asOf, today, includePotential)],
    [base, building, asOf, today, includePotential],
  )
  if (changes.length === 0) return null
  const count = `${changes.length} ${changes.length === 1 ? 'change' : 'changes'}`

  return (
    <section className={styles.bar} data-testid="scenario-bar" aria-label="Scenario" data-print="hide">
      <p className={styles.head}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.title}>Scenario</span>
        <span className={styles.count} data-testid="scenario-count">{count}</span>
      </p>
      <dl className={styles.metrics}>
        <Metric label="Occupancy" testId="scenario-occupancy" before={pct(before.occupancyPct)} after={pct(after.occupancyPct)} />
        <Metric label="Vacant" testId="scenario-vacant" before={formatSf(before.vacantSf)} after={formatSf(after.vacantSf)} />
        <Metric label="Rent roll" testId="scenario-rent-roll" before={formatMoney(before.rentRoll)} after={formatMoney(after.rentRoll)}
          delta={signedMoney(after.rentRoll - before.rentRoll)} />
      </dl>
      <button type="button" className={styles.reset} data-testid="scenario-reset" onClick={() => dispatch({ type: 'scenario/reset' })}>
        Reset
      </button>
    </section>
  )
}
