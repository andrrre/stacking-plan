import { useCallback, useEffect, useRef } from 'react'
import { useAppState } from '../../app/state/useAppState'
import type { ParsedQuery } from '../../domain/types'

/**
 * Fills the search form from the assistant through the reducer's `ask/apply`, the one UI effect it may have. A
 * requirement the broker edited after the turn began (`begin`) is never overwritten: `apply` returns false. The
 * assistant's own fills move the baseline, so a later fill in the same turn still applies.
 */
export function useRequirementApply() {
  const { state, dispatch } = useAppState()
  const current = useRef(state.req)
  const baseline = useRef(state.req)
  const ownFill = useRef(false)
  useEffect(() => {
    current.current = state.req
    if (ownFill.current) baseline.current = state.req
    ownFill.current = false
  }, [state.req])

  const begin = useCallback(() => {
    baseline.current = current.current
  }, [])

  const apply = useCallback((parsed: ParsedQuery): boolean => {
    if (current.current !== baseline.current) return false
    ownFill.current = true
    dispatch({ type: 'ask/apply', parsed })
    return true
  }, [dispatch])

  return { begin, apply }
}
