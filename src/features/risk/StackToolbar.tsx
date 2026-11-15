import { useAppState } from '../../app/state/useAppState'
import { ViewToggle } from '../three-d/ViewToggle'
import { ColourModeToggle } from './ColourModeToggle'
import styles from './risk.module.css'

export function StackToolbar() {
  const { state, dispatch } = useAppState()
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Stack display options">
      <ColourModeToggle mode={state.mode} onChange={(mode) => dispatch({ type: 'mode/set', mode })} />
      <ViewToggle view={state.view} onChange={(view) => dispatch({ type: 'view/set', view })} />
    </div>
  )
}
