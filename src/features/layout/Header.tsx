import { selectBuilding } from '../../app/state/selectBuilding'
import { useAppState } from '../../app/state/useAppState'
import styles from './Header.module.css'

function BrandMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="16" height="4" rx="1" fill="var(--c-occupied)" />
      <rect x="2" y="8" width="9" height="4" rx="1" fill="var(--c-expiring-edge)" />
      <rect x="12" y="8" width="6" height="4" rx="1" fill="var(--c-vacant)" />
      <rect x="2" y="14" width="16" height="4" rx="1" fill="var(--c-accent)" />
    </svg>
  )
}

export function Header() {
  const { state } = useAppState()
  const building = selectBuilding(state)
  return (
    <header className={styles.header} data-testid="app-header">
      <div className={styles.brand}>
        <BrandMark />
        <h1 className={styles.title}>StackMatch</h1>
      </div>
      <div className={styles.building}>
        <span className={styles.buildingName}>{building.name}</span>
        <span className={styles.address}>{building.address}</span>
        {/* slot:building-switcher (S10) */}
      </div>
      <span className={styles.badge} data-testid="demo-badge">Demo data</span>
      <div className={styles.actions} data-print="hide">
        {/* slot:import (S14) */}
        {/* slot:summary-button (S9) */}
        <button type="button" className={styles.button} onClick={() => window.print()}>Print</button>
      </div>
    </header>
  )
}
