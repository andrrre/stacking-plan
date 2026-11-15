import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { StateProvider } from './StateProvider'
import { initState } from './init'
import { useAppState } from './useAppState'
import { useUrlSync } from './useUrlSync'

function setup(search: string) {
  window.history.replaceState(null, '', `/${search}`)
  const initial = initState(search, null, '2026-11-15')
  const wrapper = ({ children }: { children: ReactNode }) => <StateProvider initialState={initial}>{children}</StateProvider>
  return renderHook(() => { useUrlSync(); return useAppState() }, { wrapper })
}

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => vi.restoreAllMocks())

describe('useUrlSync', () => {
  it('writes state changes with replaceState and never pushState', () => {
    const { result } = setup('')
    const replace = vi.spyOn(window.history, 'replaceState')
    const push = vi.spyOn(window.history, 'pushState')
    act(() => result.current.dispatch({ type: 'mode/set', mode: 'risk' }))
    act(() => result.current.dispatch({ type: 'req/set', patch: { minSf: 9000 } }))
    expect(window.location.search).toBe('?mode=risk&min=9000')
    expect(replace).toHaveBeenCalledTimes(2)
    expect(push).not.toHaveBeenCalled()
  })

  it('does not write when the string is unchanged', () => {
    const { result } = setup('?mode=risk')
    const replace = vi.spyOn(window.history, 'replaceState')
    act(() => result.current.dispatch({ type: 'select', selection: { kind: 'suite', suiteId: 'odt-500' } }))
    act(() => result.current.dispatch({ type: 'mode/set', mode: 'risk' }))
    expect(replace).not.toHaveBeenCalled()
  })

  it('keeps today only when it was present on load', () => {
    const withToday = setup('?today=2026-11-15')
    act(() => withToday.result.current.dispatch({ type: 'mode/set', mode: 'risk' }))
    expect(window.location.search).toBe('?today=2026-11-15&mode=risk')
    withToday.unmount()
    const without = setup('')
    act(() => without.result.current.dispatch({ type: 'mode/set', mode: 'risk' }))
    expect(window.location.search).toBe('?mode=risk')
  })

  it('cleans garbage parameters on first write', () => {
    setup('?min=-5&mode=x')
    expect(window.location.search).toBe('')
  })
})
