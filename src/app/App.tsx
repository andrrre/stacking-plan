import { CenterPane } from '../features/layout/CenterPane'
import { Header } from '../features/layout/Header'
import { LeftRail } from '../features/layout/LeftRail'
import { RightPanel } from '../features/layout/RightPanel'
import { KpiBar } from '../features/kpi/KpiBar'
import { useAppState } from './state/useAppState'
import styles from './App.module.css'

// The shell (data-print="shell") holds the whole working screen. Overlays such as the client summary
// sit outside it, so printing the summary can hide the shell (global.css).
export function App() {
  const { state } = useAppState()
  // slot:url-sync (S10)
  return (
    <div className={styles.app} data-overlay={state.overlay}>
      <div className={styles.shell} data-print="shell">
        <Header />
        <KpiBar />
        <main className={styles.body}>
          <LeftRail />
          <CenterPane />
          <RightPanel />
        </main>
      </div>
      {/* slot:overlays (S9) */}
    </div>
  )
}
