import { FormValidityProvider } from '../features/finder/FormValidityProvider'
import { CenterPane } from '../features/layout/CenterPane'
import { Header } from '../features/layout/Header'
import { LeftRail } from '../features/layout/LeftRail'
import { RightPanel } from '../features/layout/RightPanel'
import { useDrawers } from '../features/layout/useDrawers'
import { KpiBar } from '../features/kpi/KpiBar'
import { Overlays } from '../features/shortlist/Overlays'
import { useAppState } from './state/useAppState'
import { useUrlSync } from './state/useUrlSync'
import styles from './App.module.css'

// The shell (data-print="shell") holds the whole working screen. Overlays such as the client summary
// sit outside it, so printing the summary can hide the shell (global.css). A suite tour hides the KPI bar
// (and the centre pane its own bars), so the building has the screen.
export function App() {
  const { state } = useAppState()
  useUrlSync()
  const { left, right } = useDrawers()
  return (
    <div className={styles.app} data-overlay={state.overlay}>
      <div className={styles.shell} data-print="shell">
        <Header />
        {state.tour === null && <KpiBar />}
        <main className={styles.body} data-details={right.open ? 'open' : 'closed'}>
          <FormValidityProvider>
            <LeftRail {...left} />
            <CenterPane />
            <RightPanel {...right} />
          </FormValidityProvider>
        </main>
      </div>
      <Overlays />
    </div>
  )
}
