import { afterEach, describe, it, expect } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { StateProvider } from './StateProvider'
import { useAppState } from './useAppState'
import { initState } from './init'
import { SHORTLIST_KEY } from './storage'
import type { ShortlistEntry } from '../../domain/types'

const initial = initState('', null, '2026-11-15')
const wrapper = ({ children }: { children: ReactNode }) => <StateProvider initialState={initial}>{children}</StateProvider>

const entry: ShortlistEntry = {
  id: 'odt|2026-11-15|odt-500|b', buildingId: 'odt', asOf: '2026-11-15', whatIf: false,
  candidate: {
    key: 'odt-500', suiteIds: ['odt-500'], suiteNumbers: ['500'], floor: 5, totalSf: 10250, excessSf: 250,
    blendedRentPsf: 48, availableFrom: '2026-11-15', availability: 'now', caveats: [],
  },
}

afterEach(() => localStorage.clear())

describe('StateProvider and useAppState', () => {
  it('provides state and dispatch', () => {
    const { result } = renderHook(() => useAppState(), { wrapper })
    expect(result.current.state.today).toBe('2026-11-15')
    act(() => result.current.dispatch({ type: 'mode/set', mode: 'risk' }))
    expect(result.current.state.mode).toBe('risk')
  })

  it('persists the shortlist to localStorage when it changes', () => {
    const { result } = renderHook(() => useAppState(), { wrapper })
    act(() => result.current.dispatch({ type: 'shortlist/add', entry }))
    expect(JSON.parse(localStorage.getItem(SHORTLIST_KEY) ?? 'null')).toEqual([entry])
  })

  it('throws outside the provider', () => {
    function Probe() {
      useAppState()
      return null
    }
    expect(() => render(<Probe />)).toThrow(/StateProvider/)
  })

  it('renders its children', () => {
    render(<StateProvider initialState={initial}><p>child</p></StateProvider>)
    expect(screen.getByText('child')).toBeInTheDocument()
  })
})
