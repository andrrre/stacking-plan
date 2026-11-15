import { useMemo } from 'react'
import { kpis } from '../../domain/kpis'
import { selectBuilding } from '../../app/state/selectBuilding'
import { useAppState } from '../../app/state/useAppState'
import { useMatches } from '../finder/useMatches'
import { buildStackModel, type StackModel } from './suiteVisual'

// S11 replaces NO_MODIFIED with modifiedSuiteIds(...).
const NO_MODIFIED: ReadonlySet<string> = new Set()

export function useStackModel(): StackModel {
  const { state } = useAppState()
  const { matches } = useMatches()
  const building = selectBuilding(state)
  const { asOf, today, mode, highlight, selection } = state
  const includePotential = state.req.includePotential
  const selectedSuiteId = selection?.kind === 'suite' ? selection.suiteId : null

  const highlightIds = useMemo(
    () => (highlight === null ? null : new Set(kpis(building, asOf, today, includePotential).ids[highlight])),
    [building, asOf, today, includePotential, highlight],
  )

  return useMemo(
    () => buildStackModel({
      building, asOf, today, mode, matches, highlightIds, modifiedIds: NO_MODIFIED, selectedSuiteId,
    }),
    // S11: add `modifiedIds` here when you replace NO_MODIFIED.
    [building, asOf, today, mode, matches, highlightIds, selectedSuiteId],
  )
}
