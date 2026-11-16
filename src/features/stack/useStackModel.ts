import { useMemo } from 'react'
import { applyMove } from '../../domain/makeRoom'
import { kpis } from '../../domain/kpis'
import { selectBuilding } from '../../app/state/selectBuilding'
import { selectBaseBuilding } from '../../app/state/selectors'
import { modifiedSuiteIds } from '../../domain/scenario'
import { useAppState } from '../../app/state/useAppState'
import { useMatches } from '../finder/useMatches'
import { buildStackModel, type StackModel } from './suiteVisual'

export function useStackModel(): StackModel {
  const { state } = useAppState()
  const { matches: found } = useMatches()
  const scenario = selectBuilding(state)
  const base = selectBaseBuilding(state)
  const { asOf, today, mode, highlight, selection, changes, legend, movePreview } = state
  // A preview shows the move applied and the block it frees; the finder keeps its own matches (state.changes is untouched).
  const building = useMemo(
    () => (movePreview ? applyMove(scenario, movePreview, asOf) : scenario),
    [scenario, movePreview, asOf],
  )
  const matches = useMemo(() => (movePreview ? [movePreview.freed] : found), [movePreview, found])
  const move = useMemo(
    () => (movePreview ? { fromId: movePreview.from.suiteId, toId: movePreview.to.suiteId } : null),
    [movePreview],
  )
  const includePotential = state.req.includePotential
  const selectedSuiteId = selection?.kind === 'suite' ? selection.suiteId : null

  const highlightIds = useMemo(
    () => (highlight === null ? null : new Set(kpis(building, asOf, today, includePotential).ids[highlight])),
    [building, asOf, today, includePotential, highlight],
  )

  const modifiedIds = useMemo(() => modifiedSuiteIds(base, changes), [base, changes])

  return useMemo(
    () => buildStackModel({
      building, asOf, today, mode, matches, highlightIds, modifiedIds, selectedSuiteId, legend, move,
    }),
    [building, asOf, today, mode, matches, highlightIds, modifiedIds, selectedSuiteId, legend, move],
  )
}
