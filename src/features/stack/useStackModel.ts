import { useMemo } from 'react'
import { kpis } from '../../domain/kpis'
import type { Candidate } from '../../domain/types'
import { selectBuilding } from '../../app/state/selectBuilding'
import { useAppState } from '../../app/state/useAppState'
import { buildStackModel, type StackModel } from './suiteVisual'

// S5 replaces NO_MATCHES with useMatches().matches; S11 replaces NO_MODIFIED with modifiedSuiteIds(...).
const NO_MATCHES: readonly Candidate[] = []
const NO_MODIFIED: ReadonlySet<string> = new Set()

export function useStackModel(): StackModel {
  const { state } = useAppState()
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
      building, asOf, today, mode, matches: NO_MATCHES, highlightIds, modifiedIds: NO_MODIFIED, selectedSuiteId,
    }),
    [building, asOf, today, mode, highlightIds, selectedSuiteId],
  )
}
