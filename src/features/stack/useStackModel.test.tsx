import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { makeRoom } from '../../domain/makeRoom'
import { BUNDLED_BUILDINGS } from '../../data'
import { initState } from '../../app/state/init'
import { AppStateContext } from '../../app/state/useAppState'
import type { AppState } from '../../app/state/types'
import { useStackModel } from './useStackModel'

const TODAY = '2026-11-15'

function renderModel(over: Partial<AppState> = {}) {
  const state: AppState = { ...initState('', null, TODAY), ...over }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppStateContext.Provider value={{ state, dispatch: () => undefined }}>{children}</AppStateContext.Provider>
  )
  const { result } = renderHook(() => useStackModel(), { wrapper })
  return result.current.floors.flatMap((f) => f.suites)
}

describe('useStackModel', () => {
  it('builds the hero building at today with nothing dimmed or selected', () => {
    const suites = renderModel()
    expect(suites).toHaveLength(32)
    expect(suites.some((v) => v.dimmed || v.selected || v.modified || v.matchRank !== null)).toBe(false)
  })

  it('a highlighted KPI tile leaves exactly its suites undimmed', () => {
    const lit = renderModel({ highlight: 'largestBlock' }).filter((v) => !v.dimmed).map((v) => v.suite.number)
    expect(lit).toEqual(['700', '710'])
  })

  it('a suite selection marks that suite selected; a match selection selects no suite', () => {
    const picked = renderModel({ selection: { kind: 'suite', suiteId: 'odt-600' } }).filter((v) => v.selected)
    expect(picked.map((v) => v.suite.number)).toEqual(['600'])
    expect(renderModel({ selection: { kind: 'match', key: 'odt-500' } }).some((v) => v.selected)).toBe(false)
  })

  it('follows mode and asOf', () => {
    const suites = renderModel({ mode: 'risk', asOf: '2027-07-01' })
    expect(suites.find((v) => v.suite.number === '600')?.fill).toBe('potential')
    expect(suites.find((v) => v.suite.number === '900')?.fill).toBe('risk-le36')
  })

  it('a preview shows the applied building and the freed block; state.changes stays empty', () => {
    const [option] = makeRoom(BUNDLED_BUILDINGS[0], { minSf: 12_000, includePotential: false }, TODAY, TODAY)
    if (!option) throw new Error('expected a move option')
    const suites = renderModel({ movePreview: option })
    expect(suites.find((v) => v.suite.number === '410')).toMatchObject({ move: 'in', dimmed: false })
    expect(suites.find((v) => v.suite.number === '410')?.label.line2).toBe('Northpier Engineering')
    expect(suites.find((v) => v.suite.number === '510')).toMatchObject({ move: 'out', matchRank: 1 })
    expect(suites.find((v) => v.suite.number === '500')?.matchRank).toBe(1)
    expect(suites.filter((v) => v.matchRank !== null)).toHaveLength(2)
  })

  it('during a preview a KPI tile lights the scenario suites its figure counts, plus the two moved suites', () => {
    const [option] = makeRoom(BUNDLED_BUILDINGS[0], { minSf: 12_000, includePotential: false }, TODAY, TODAY)
    if (!option) throw new Error('expected a move option')
    // The tile shows the scenario's largest block (700 + 710); the previewed building's would be 500 + 510.
    const lit = renderModel({ movePreview: option, highlight: 'largestBlock' }).filter((v) => !v.dimmed)
    expect(lit.map((v) => v.suite.number)).toEqual(['700', '710', '510', '410'])
  })
})
