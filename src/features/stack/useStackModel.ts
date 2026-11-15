import { useMemo } from 'react'
import { kpis } from '../../domain/kpis'
import { selectBuilding } from '../../app/state/selectBuilding'
import { selectBaseBuilding } from '../../app/state/selectors'
import { modifiedSuiteIds } from '../../domain/scenario'
import { useAppState } from '../../app/state/useAppState'
import { useMatches } from '../finder/useMatches'
import { buildStackModel, type StackModel } from './suiteVisual'

export function useStackModel(): StackModel {
  const { state } = useAppState()
  const { matches } = useMatches()
  const building = selectBuilding(state)
  const base = selectBaseBuilding(state)
  const { asOf, today, mode, highlight, selection, changes } = state
  const includePotential = state.req.includePotential
  const selectedSuiteId = selection?.kind === 'suite' ? selection.suiteId : null

  const highlightIds = useMemo(
    () => (highlight === null ? null : new Set(kpis(building, asOf, today, includePotential).ids[highlight])),
    [building, asOf, today, includePotential, highlight],
  )

  const modifiedIds = useMemo(() => modifiedSuiteIds(base, changes), [base, changes])

  return useMemo(
    () => buildStackModel({
      building, asOf, today, mode, matches, highlightIds, modifiedIds, selectedSuiteId,
    }),
    [building, asOf, today, mode, matches, highlightIds, modifiedIds, selectedSuiteId],
  )
}
