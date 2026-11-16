import { selectBuilding } from '../../app/state/selectBuilding'
import { BUNDLED_BUILDINGS } from '../../data'
import { useAppState } from '../../app/state/useAppState'
import { BuildingSwitcher } from '../building/BuildingSwitcher'
import { ImportCsv } from '../import/ImportCsv'
import { SummaryButton } from '../shortlist/SummaryButton'
import { ThemeToggle } from '../theme/ThemeToggle'
import { TourButton } from '../tour/TourButton'
import { PresentButton } from './PresentButton'
import styles from './Header.module.css'

function BrandMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <rect className={styles.markTop} x="2" y="3" width="18" height="4" />
      <rect className={styles.markMid} x="2" y="9" width="18" height="4" />
      <rect className={styles.markLow} x="2" y="15" width="18" height="4" />
    </svg>
  )
}

export function Header() {
  const { state } = useAppState()
  const building = selectBuilding(state)
  const isDemo = BUNDLED_BUILDINGS.some((b) => b.id === building.id) // imported buildings are the broker's own data
  return (
    <header className={styles.header} data-testid="app-header">
      <div className={styles.brand}>
        <BrandMark />
        <h1 className={styles.title}>StackMatch</h1>
      </div>
      <div className={styles.building}>
        <BuildingSwitcher />
        <span className={styles.address}>{building.address}</span>
        {isDemo && <span className={styles.badge} data-testid="demo-badge">Demo data</span>}
      </div>
      <div className={styles.actions} data-print="hide">
        <ImportCsv buttonClassName={styles.button} />
        <button type="button" className={styles.button} onClick={() => window.print()}>Print</button>
        <PresentButton className={styles.button} />
        <TourButton className={styles.button} />
        <SummaryButton className={styles.primary} />
        <ThemeToggle className={styles.iconButton} />
      </div>
    </header>
  )
}
