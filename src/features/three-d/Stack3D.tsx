import { useCallback, useMemo, type CSSProperties, type MouseEvent } from 'react'
import { selectBuilding } from '../../app/state/selectBuilding'
import { useAppState } from '../../app/state/useAppState'
import { useRovingFocus } from '../stack/useRovingFocus'
import { useStackModel } from '../stack/useStackModel'
import { Floor3D } from './Floor3D'
import { mirrorKeys } from './mirrorKeys'
import { isDefaultAngle, useDragRotate, type DragRotate } from './useDragRotate'
import styles from './three-d.module.css'

const DENSE_FLOORS = 16

/**
 * The same building as extruded floor slabs in an axonometric projection (CSS 3D transforms only, no
 * perspective). Same model, colours, outlines, dimming and selection as the 2D stack; drag rotates it.
 * `rotation` lets a parent keep the angle across a 2D/3D round trip; without it the view owns its angle.
 */
export function Stack3D({ rotation }: { rotation?: DragRotate }) {
  const model = useStackModel()
  const { state, dispatch } = useAppState()
  const own = useDragRotate()
  const { angle, dragging, rotateBy, reset, consumeDragClick, handlers } = rotation ?? own
  const buildingName = selectBuilding(state).name
  const selectedId = state.selection?.kind === 'suite' ? state.selection.suiteId : null

  const grid = useMemo(() => model.floors.map((f) => f.suites.map((v) => v.suite.id)), [model])
  const onSelect = useCallback(
    (id: string | null) => dispatch({ type: 'select', selection: id === null ? null : { kind: 'suite', suiteId: id } }),
    [dispatch],
  )
  const { getItemProps } = useRovingFocus(grid, { selectedId, onSelect })
  const getProps = (id: string) => mirrorKeys(getItemProps(id), angle)
  const swallowDragClick = (e: MouseEvent) => {
    if (!consumeDragClick()) return
    e.stopPropagation()
    e.preventDefault()
  }

  const count = model.floors.length
  const sceneStyle = { '--rot': `${angle}deg`, '--floors': count } as CSSProperties
  return (
    <div className={styles.wrap}>
      <div
        className={styles.stage}
        data-testid="stack-3d"
        data-dragging={String(dragging)}
        role="group"
        aria-label={`3D stacking plan, ${buildingName}`}
        style={sceneStyle}
        onClickCapture={swallowDragClick}
        {...handlers}
      >
        <div className={styles.scene}>
          {model.floors.map((f, i) => (
            <Floor3D key={f.number} floor={f} level={count - 1 - i} dense={count > DENSE_FLOORS} getItemProps={getProps} onSelect={onSelect} />
          ))}
        </div>
      </div>
      <Controls angle={angle} rotateBy={rotateBy} reset={reset} />
    </div>
  )
}

function Controls({ angle, rotateBy, reset }: Pick<DragRotate, 'angle' | 'rotateBy' | 'reset'>) {
  const atDefault = isDefaultAngle(angle)
  return (
    <div className={styles.controls}>
      <span className={styles.hint}>Drag to rotate</span>
      <button type="button" className={styles.ctl} aria-label="Rotate view left" onClick={() => rotateBy(-15)}>&#8630;</button>
      <button type="button" className={styles.ctl} aria-label="Rotate view right" onClick={() => rotateBy(15)}>&#8631;</button>
      <button type="button" className={styles.ctl} aria-disabled={atDefault} onClick={() => { if (!atDefault) reset() }}>
        Reset view
      </button>
    </div>
  )
}
