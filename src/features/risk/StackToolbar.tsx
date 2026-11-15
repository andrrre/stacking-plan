import { useAppState } from '../../app/state/useAppState'
import { ColourModeToggle } from './ColourModeToggle'
import styles from './risk.module.css'

export function StackToolbar() {
  const { state, dispatch } = useAppState()
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Stack display options">
      <ColourModeToggle mode={state.mode} onChange={(mode) => dispatch({ type: 'mode/set', mode })} />
      {/* slot:view-toggle (S13) */}
    </div>
  )
}
