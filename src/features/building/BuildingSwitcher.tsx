import { selectBuildings } from '../../app/state/selectors'
import { useAppState } from '../../app/state/useAppState'
import styles from './BuildingSwitcher.module.css'

export function BuildingSwitcher() {
  const { state, dispatch } = useAppState()
  return (
    <select
      className={styles.select}
      data-testid="building-switcher"
      aria-label="Building"
      value={state.buildingId}
      onChange={(e) => dispatch({ type: 'building/set', buildingId: e.target.value })}
    >
      {selectBuildings(state).map((b) => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  )
}
