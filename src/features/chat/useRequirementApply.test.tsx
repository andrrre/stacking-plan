import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { initState } from '../../app/state/init'
import { StateProvider } from '../../app/state/StateProvider'
import { useAppState } from '../../app/state/useAppState'
import { useRequirementApply } from './useRequirementApply'

const TODAY = '2026-11-15'
const wrapper = ({ children }: { children: ReactNode }) => <StateProvider initialState={initState('', null, TODAY)}>{children}</StateProvider>

function renderApply() {
  return renderHook(() => ({ apply: useRequirementApply(), app: useAppState() }), { wrapper })
}

describe('useRequirementApply', () => {
  it('fills the form through ask/apply and moves the date to the move-in month', () => {
    const { result } = renderApply()
    act(() => result.current.apply.begin())
    let applied = false
    act(() => { applied = result.current.apply.apply({ minSf: 9000, maxRentPsf: 60, moveInBy: '2027-06-30' }) })
    expect(applied).toBe(true)
    expect(result.current.app.state.req).toMatchObject({ minSf: 9000, maxSf: null, maxRentPsf: 60 })
    expect(result.current.app.state.asOf.slice(0, 7)).toBe('2027-06')
  })

  it('a second requirement in the same turn replaces the first', () => {
    const { result } = renderApply()
    act(() => result.current.apply.begin())
    act(() => { result.current.apply.apply({ minSf: 9000 }) })
    act(() => { result.current.apply.apply({ minSf: 12000 }) })
    expect(result.current.app.state.req.minSf).toBe(12000)
  })

  it('leaves a requirement the broker edited after the turn began, and says so', () => {
    const { result } = renderApply()
    act(() => result.current.apply.begin())
    act(() => result.current.app.dispatch({ type: 'req/set', patch: { minSf: 12000 } }))
    let applied = true
    act(() => { applied = result.current.apply.apply({ minSf: 9000 }) })
    expect(applied).toBe(false)
    expect(result.current.app.state.req.minSf).toBe(12000)
  })

  it('an edit made before the turn began does not count', () => {
    const { result } = renderApply()
    act(() => result.current.app.dispatch({ type: 'req/set', patch: { minSf: 12000 } }))
    act(() => result.current.apply.begin())
    let applied = false
    act(() => { applied = result.current.apply.apply({ minSf: 9000 }) })
    expect(applied).toBe(true)
    expect(result.current.app.state.req.minSf).toBe(9000)
  })
})
