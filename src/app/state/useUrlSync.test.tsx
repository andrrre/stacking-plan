import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { StateProvider } from './StateProvider'
import { initState } from './init'
import { useAppState } from './useAppState'
import { URL_WRITE_DELAY_MS, useUrlSync } from './useUrlSync'

function setup(search: string) {
  window.history.replaceState(null, '', `/${search}`)
  const initial = initState(search, null, '2026-11-15')
  const wrapper = ({ children }: { children: ReactNode }) => <StateProvider initialState={initial}>{children}</StateProvider>
  return renderHook(() => { useUrlSync(); return useAppState() }, { wrapper })
}

const settle = () => act(() => { vi.advanceTimersByTime(URL_WRITE_DELAY_MS) })

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useUrlSync', () => {
  it('writes state changes with replaceState and never pushState', () => {
    const { result } = setup('')
    const replace = vi.spyOn(window.history, 'replaceState')
    const push = vi.spyOn(window.history, 'pushState')
    act(() => result.current.dispatch({ type: 'mode/set', mode: 'risk' }))
    settle()
    act(() => result.current.dispatch({ type: 'req/set', patch: { minSf: 9000 } }))
    settle()
    expect(window.location.search).toBe('?mode=risk&min=9000')
    expect(replace).toHaveBeenCalledTimes(2)
    expect(push).not.toHaveBeenCalled()
  })

  it('does not write when the string is unchanged', () => {
    const { result } = setup('?mode=risk')
    const replace = vi.spyOn(window.history, 'replaceState')
    act(() => result.current.dispatch({ type: 'select', selection: { kind: 'suite', suiteId: 'odt-500' } }))
    act(() => result.current.dispatch({ type: 'mode/set', mode: 'risk' }))
    settle()
    expect(replace).not.toHaveBeenCalled()
  })

  it('keeps today only when it was present on load', () => {
    const withToday = setup('?today=2026-11-15')
    act(() => withToday.result.current.dispatch({ type: 'mode/set', mode: 'risk' }))
    settle()
    expect(window.location.search).toBe('?today=2026-11-15&mode=risk')
    withToday.unmount()
    const without = setup('')
    act(() => without.result.current.dispatch({ type: 'mode/set', mode: 'risk' }))
    settle()
    expect(window.location.search).toBe('?mode=risk')
  })

  it('cleans garbage parameters on first write', () => {
    setup('?min=-5&mode=x')
    expect(window.location.search).toBe('')
  })

  it('preserves unrelated parameters', () => {
    const { result } = setup('?utm=mail')
    act(() => result.current.dispatch({ type: 'mode/set', mode: 'risk' }))
    settle()
    expect(window.location.search).toBe('?utm=mail&mode=risk')
  })

  it('debounces a burst of changes into one trailing write', () => {
    const { result } = setup('')
    const replace = vi.spyOn(window.history, 'replaceState')
    for (const minSf of [1000, 2000, 3000, 4000, 5000]) {
      act(() => result.current.dispatch({ type: 'req/set', patch: { minSf } }))
      act(() => { vi.advanceTimersByTime(URL_WRITE_DELAY_MS / 2) })
    }
    expect(replace).not.toHaveBeenCalled()
    settle()
    expect(replace).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe('?min=5000')
  })

  it('flushes a pending write on pagehide', () => {
    const { result } = setup('')
    act(() => result.current.dispatch({ type: 'mode/set', mode: 'risk' }))
    expect(window.location.search).toBe('')
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(window.location.search).toBe('?mode=risk')
  })

  it('flushes a pending write on unmount', () => {
    const { result, unmount } = setup('')
    act(() => result.current.dispatch({ type: 'mode/set', mode: 'risk' }))
    unmount()
    expect(window.location.search).toBe('?mode=risk')
  })

  it('ignores a replaceState that throws (WebKit rate limit) and writes again later', () => {
    const { result } = setup('')
    const replace = vi.spyOn(window.history, 'replaceState').mockImplementationOnce(() => {
      throw new DOMException('Attempt to use history.replaceState() more than 100 times', 'SecurityError')
    })
    act(() => result.current.dispatch({ type: 'mode/set', mode: 'risk' }))
    expect(() => settle()).not.toThrow()
    expect(window.location.search).toBe('')
    act(() => result.current.dispatch({ type: 'req/set', patch: { minSf: 9000 } }))
    settle()
    expect(replace).toHaveBeenCalledTimes(2)
    expect(window.location.search).toBe('?mode=risk&min=9000')
  })
})
