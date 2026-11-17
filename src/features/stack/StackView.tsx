import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import { selectBuilding } from '../../app/state/selectBuilding'
import { useAppState } from '../../app/state/useAppState'
import { FloorRow } from './FloorRow'
import { useRovingFocus } from './useRovingFocus'
import { useStackModel } from './useStackModel'
import { useReducedMotion } from '../three-d/useReducedMotion'
import styles from './stack.module.css'

/** During a suite tour (over the stand-in 2D stack), each stop's first suite is scrolled into view as it comes up. */
function useTourScroll(stack: RefObject<HTMLDivElement | null>, suiteId: string | undefined): void {
  const reduced = useReducedMotion()
  useEffect(() => {
    if (suiteId === undefined) return
    const cell = stack.current?.querySelector(`[data-suite-id="${CSS.escape(suiteId)}"]`)
    cell?.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [stack, suiteId, reduced])
}

/**
 * The stacking plan: floors top-down, suites left to right, one roving tab stop over all suites. During a suite
 * tour it is shown, not used: it shows no tenant (no line 2) and is hidden from the keyboard and assistive tech,
 * which follow the tour's own card and bar.
 */
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
  const ref = useRef<HTMLDivElement>(null)
  const touring = state.tour !== null
  useTourScroll(ref, state.tour?.stops[state.tour.index]?.suiteIds[0])

  return (
    <div ref={ref} className={styles.stack} data-testid="stack" role="group" aria-label={`Stacking plan, ${buildingName}`}
      data-tour={touring || undefined} inert={touring} aria-hidden={touring || undefined}>
      {model.floors.map((f) => (
        <FloorRow key={f.number} floor={f} getItemProps={getItemProps} onSelect={onSelect} />
      ))}
    </div>
  )
}
