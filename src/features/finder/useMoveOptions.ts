import { useMemo } from 'react'
import { selectBuilding } from '../../app/state/selectBuilding'
import { useAppState } from '../../app/state/useAppState'
import { makeRoom } from '../../domain/makeRoom'
import type { MoveOption } from '../../domain/types'
import { useMatches } from './useMatches'

/** One-tenant moves that would free a block for the active requirement; empty unless nothing fits. */
export function useMoveOptions(): MoveOption[] {
  const { state } = useAppState()
  const { req, matches } = useMatches()
  const building = selectBuilding(state)
  const { asOf, today } = state
  const noMatches = matches.length === 0
  return useMemo(() => (req && noMatches ? makeRoom(building, req, asOf, today) : []), [building, req, noMatches, asOf, today])
}
