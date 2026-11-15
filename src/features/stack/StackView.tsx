import { useCallback, useMemo } from 'react'
import { selectBuilding } from '../../app/state/selectBuilding'
import { useAppState } from '../../app/state/useAppState'
import { FloorRow } from './FloorRow'
import { useRovingFocus } from './useRovingFocus'
import { useStackModel } from './useStackModel'
import styles from './stack.module.css'

/** The stacking plan: floors top-down, suites left to right, one roving tab stop over all suites. */
export function StackView() {
  const model = useStackModel()
  const { state, dispatch } = useAppState()
  const buildingName = selectBuilding(state).name
  const selectedId = state.selection?.kind === 'suite' ? state.selection.suiteId : null

  const grid = useMemo(() => model.floors.map((f) => f.suites.map((v) => v.suite.id)), [model])
  const onSelect = useCallback(
    (id: string | null) => dispatch({ type: 'select', selection: id === null ? null : { kind: 'suite', suiteId: id } }),
    [dispatch],
  )
  const { getItemProps } = useRovingFocus(grid, { selectedId, onSelect })

  return (
    <div className={styles.stack} data-testid="stack" role="group" aria-label={`Stacking plan, ${buildingName}`}>
      {model.floors.map((f) => (
        <FloorRow key={f.number} floor={f} getItemProps={getItemProps} onSelect={onSelect} />
      ))}
    </div>
  )
}
