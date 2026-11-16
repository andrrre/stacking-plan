import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Layout3D } from '../layout3d'
import type { SuiteVisual } from '../../stack/suiteVisual'
import { useMoveFlight } from './useMoveFlight'

const visual = (id: string, move: SuiteVisual['move']) => ({ suite: { id }, move }) as unknown as SuiteVisual
const visuals = (moves: Record<string, SuiteVisual['move']>) => new Map(Object.entries(moves).map(([id, m]) => [id, visual(id, m)]))
const layoutOf = (...ids: string[]) => ({ suites: ids.map((id) => ({ id })) }) as unknown as Layout3D

const WHOLE = layoutOf('a', 'b', 'c')
const NONE = visuals({ a: null, b: null, c: null })
const AB = () => visuals({ a: 'out', b: 'in', c: null })

type Args = { v: ReadonlyMap<string, SuiteVisual>; layout: Layout3D; reduced: boolean }
const start = (v: ReadonlyMap<string, SuiteVisual>, layout = WHOLE, reduced = false) =>
  renderHook((p: Args) => useMoveFlight(p.v, p.layout, p.reduced), { initialProps: { v, layout, reduced } })

describe('useMoveFlight', () => {
  it('does not fly without a previewed move', () => {
    expect(start(NONE).result.current).toMatchObject({ pair: null, flying: false })
  })

  it('flies a new pair until it lands, and a re-render of the same pair does not fly it again', () => {
    const h = start(NONE)
    h.rerender({ v: AB(), layout: WHOLE, reduced: false })
    expect(h.result.current).toMatchObject({ pair: { outId: 'a', inId: 'b' }, flying: true })
    h.rerender({ v: AB(), layout: WHOLE, reduced: false })
    expect(h.result.current.flying).toBe(true)
    act(() => h.result.current.land())
    expect(h.result.current.flying).toBe(false)
    h.rerender({ v: AB(), layout: WHOLE, reduced: false })
    expect(h.result.current.flying).toBe(false)
  })

  it('flies again when the preview ends and starts again, or the pair changes', () => {
    const h = start(AB())
    act(() => h.result.current.land())
    h.rerender({ v: NONE, layout: WHOLE, reduced: false })
    expect(h.result.current.flying).toBe(false)
    h.rerender({ v: AB(), layout: WHOLE, reduced: false })
    expect(h.result.current.flying).toBe(true)
    h.rerender({ v: visuals({ a: null, b: 'out', c: 'in' }), layout: WHOLE, reduced: false })
    expect(h.result.current).toMatchObject({ pair: { outId: 'b', inId: 'c' }, flying: true })
  })

  it('never flies under reduced motion', () => {
    expect(start(AB(), WHOLE, true).result.current.flying).toBe(false)
  })

  it('ends at once when a suite of the pair leaves the layout, and does not fly again when it comes back', () => {
    const h = start(AB())
    h.rerender({ v: AB(), layout: layoutOf('b', 'c'), reduced: false })
    expect(h.result.current.flying).toBe(false)
    h.rerender({ v: AB(), layout: WHOLE, reduced: false })
    expect(h.result.current.flying).toBe(false)
  })
})
