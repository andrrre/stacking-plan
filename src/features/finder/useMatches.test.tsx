import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { initState } from '../../app/state/init'
import type { AppState, RequirementDraft } from '../../app/state/types'
import { AppStateContext } from '../../app/state/useAppState'
import { useStackModel } from '../stack/useStackModel'
import { useMatches } from './useMatches'

const TODAY = '2026-11-15'

function stateWith(req: Partial<RequirementDraft>, over: Partial<AppState> = {}): AppState {
  const base = initState('', null, TODAY)
  return { ...base, ...over, req: { ...base.req, ...req } }
}

function renderWith<T>(hook: () => T, state: AppState): T {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppStateContext.Provider value={{ state, dispatch: () => undefined }}>{children}</AppStateContext.Provider>
  )
  return renderHook(hook, { wrapper }).result.current
}

describe('useMatches', () => {
  it('no requirement → null and no matches', () => {
    expect(renderWith(useMatches, stateWith({}))).toEqual({ req: null, matches: [] })
  })

  it('min 10,000 today → 500 and 700+710', () => {
    const { req, matches } = renderWith(useMatches, stateWith({ minSf: 10_000 }))
    expect(req).toEqual({ minSf: 10_000, includePotential: true })
    expect(matches.map((c) => c.key)).toEqual(['odt-500', 'odt-700+odt-710'])
  })

  it('follows asOf, the potential toggle and the maxima', () => {
    const at = (req: Partial<RequirementDraft>) =>
      renderWith(useMatches, stateWith({ minSf: 10_000, ...req }, { asOf: '2027-07-01' })).matches.map((c) => c.suiteNumbers.join('+'))
    expect(at({})).toEqual(['400+410', '500', '700+710', '600'])
    expect(at({ includePotential: false })).toEqual(['400+410', '500', '700+710'])
    expect(at({ maxSf: 10_300 })).toEqual(['400+410', '500'])
    expect(at({ maxRentPsf: 50 })).toEqual(['400+410', '500', '600'])
  })
})

describe('useMatches stability', () => {
  it('keeps the same req and matches when other state, or a copy of the same draft, changes', () => {
    let state = stateWith({ minSf: 10_000 })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppStateContext.Provider value={{ state, dispatch: () => undefined }}>{children}</AppStateContext.Provider>
    )
    const { result, rerender } = renderHook(useMatches, { wrapper })
    const first = result.current
    state = { ...state, mode: 'risk', req: { ...state.req } }
    rerender()
    expect(result.current.req).toBe(first.req)
    expect(result.current.matches).toBe(first.matches)
    state = { ...state, req: { ...state.req, minSf: 10_400 } }
    rerender()
    expect(result.current.req).toEqual({ minSf: 10_400, includePotential: true })
  })
})

describe('useStackModel with matches', () => {
  it('ranks the matched suites, outlines 700+710 as one run, and dims everything else', () => {
    const model = renderWith(useStackModel, stateWith({ minSf: 10_000 }))
    const suites = model.floors.flatMap((f) => f.suites)
    const ranked = suites.filter((v) => v.matchRank !== null).map((v) => [v.suite.number, v.matchRank])
    expect(ranked).toEqual([['700', 2], ['710', 2], ['500', 1]])
    expect(suites.filter((v) => !v.dimmed).map((v) => v.suite.number)).toEqual(['700', '710', '500'])
    expect(model.floors.find((f) => f.number === 7)?.runs).toEqual([{ rank: 2, first: 0, last: 1 }])
  })
})
