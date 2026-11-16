import { useCallback, useMemo, type ReactElement } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initState } from '../../app/state/init'
import { AppStateContext, useAppState } from '../../app/state/useAppState'
import type { Action, AppState } from '../../app/state/types'
import { StackView } from '../stack/StackView'
import { useRovingFocus } from '../stack/useRovingFocus'
import { useStackModel } from '../stack/useStackModel'
import { Building3D } from './Building3D'
import { Fallback } from './Fallback3D'
import { Mirror } from './Mirror'
import type { ScreenPoint } from './sceneTypes'
import { ViewSwitch } from './ViewSwitch'
import { canUseWebGL } from './webgl'

const TODAY = '2026-11-15'

function renderWith(ui: ReactElement, over: Partial<AppState> = {}) {
  const state: AppState = { ...initState('', null, TODAY), ...over }
  const dispatch = vi.fn<(a: Action) => void>()
  const utils = render(<AppStateContext.Provider value={{ state, dispatch }}>{ui}</AppStateContext.Provider>)
  return { ...utils, dispatch }
}

/** The mirror wired the way Building3D wires it, without the WebGL scene (jsdom has none). */
function MirrorHarness({ points = new Map(), onFocusChange = () => undefined }: { points?: ReadonlyMap<string, ScreenPoint>; onFocusChange?: (id: string | null) => void }) {
  const model = useStackModel()
  const { state, dispatch } = useAppState()
  const selectedId = state.selection?.kind === 'suite' ? state.selection.suiteId : null
  const grid = useMemo(() => model.floors.map((f) => f.suites.map((v) => v.suite.id)), [model])
  const onSelect = useCallback(
    (id: string | null) => dispatch({ type: 'select', selection: id === null ? null : { kind: 'suite', suiteId: id } }),
    [dispatch],
  )
  const { getItemProps } = useRovingFocus(grid, { selectedId, onSelect })
  return <Mirror model={model} points={points} getItemProps={getItemProps} onSelect={onSelect} onFocusChange={onFocusChange} />
}

const ATTRS = ['title', 'data-status', 'data-overlay', 'data-fill', 'data-risk', 'data-match-rank', 'data-dimmed', 'data-modified', 'data-joins-next', 'data-filtered', 'aria-pressed', 'aria-label']
const snapshot = (el: Element) => Object.fromEntries(ATTRS.map((a) => [a, el.getAttribute(a)]))

describe('WebGL availability', () => {
  it('jsdom has no WebGL, so the probe says no (and asks only once)', () => {
    expect(canUseWebGL()).toBe(false)
    expect(canUseWebGL()).toBe(false)
  })

  it('without WebGL the 3D building falls back to the 2D stack with a short note', () => {
    renderWith(<Building3D />)
    expect(screen.getByTestId('webgl-fallback')).toHaveTextContent(/needs WebGL/)
    expect(screen.getByTestId('stack')).toBeInTheDocument()
    expect(screen.getAllByTestId(/^suite-odt-/)).toHaveLength(32)
    expect(screen.queryByTestId('stack-3d')).toBeNull()
  })

  it('says why the 2D stack is shown, and offers a retry only when the 3D view failed to load', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    const a = renderWith(<Fallback reason="unavailable" />)
    expect(screen.getByTestId('webgl-fallback')).toHaveTextContent(/needs WebGL/)
    expect(screen.queryByTestId('retry-3d')).toBeNull()
    a.unmount()
    const b = renderWith(<Fallback reason="lost" />)
    expect(screen.getByTestId('webgl-fallback')).toHaveTextContent(/stopped working/)
    b.unmount()
    renderWith(<Fallback reason="load" onRetry={retry} />)
    expect(screen.getByTestId('webgl-fallback')).toHaveTextContent(/failed to load/)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('ViewSwitch: the 3D building for view=3d (here its fallback), the plain 2D stack for view=stack', () => {
    const a = renderWith(<ViewSwitch />, { view: '3d' })
    expect(screen.getByTestId('webgl-fallback')).toBeInTheDocument()
    a.unmount()
    renderWith(<ViewSwitch />, { view: 'stack' })
    expect(screen.getByTestId('stack')).toBeInTheDocument()
    expect(screen.queryByTestId('webgl-fallback')).toBeNull()
  })
})

describe('DOM mirror', () => {
  it('has one button per suite with exactly the 2D attributes and accessible name', () => {
    const base = initState('', null, TODAY)
    const scenarios: Partial<AppState>[] = [
      {},
      { mode: 'risk' },
      { req: { ...base.req, minSf: 10_000 }, selection: { kind: 'suite', suiteId: 'odt-600' } },
      { asOf: '2027-07-01', req: { ...base.req, minSf: 10_000 } },
      { highlight: 'vacant' },
    ]
    for (const over of scenarios) {
      const two = renderWith(<StackView />, over)
      const flat = new Map(screen.getAllByTestId(/^suite-odt-/).map((el) => [el.getAttribute('data-testid')?.slice(6), snapshot(el)]))
      two.unmount()
      const three = renderWith(<MirrorHarness />, over)
      const mirror = screen.getAllByTestId(/^suite3d-/)
      expect(mirror).toHaveLength(flat.size)
      for (const el of mirror) {
        const id = el.getAttribute('data-testid')?.slice(8)
        expect(snapshot(el), `${id} ${JSON.stringify(over)}`).toEqual(flat.get(id))
        expect(el.tagName).toBe('BUTTON')
      }
      three.unmount()
    }
  })

  it('carries each suite’s screen point once the scene reports it', () => {
    renderWith(<MirrorHarness points={new Map([['odt-500', { x: 120, y: 340, hit: true }]])} />)
    const b = screen.getByTestId('suite3d-odt-500')
    expect(b).toHaveAttribute('data-screen-x', '120')
    expect(b).toHaveAttribute('data-screen-y', '340')
    expect(b).toHaveAttribute('data-screen-hit', 'true')
    expect(screen.getByTestId('suite3d-odt-600')).not.toHaveAttribute('data-screen-x')
  })

  it('roves like the 2D stack: one tab stop, arrows move, Enter selects, Escape clears; focus is reported', async () => {
    const user = userEvent.setup()
    const focus = vi.fn()
    const { dispatch } = renderWith(<MirrorHarness onFocusChange={focus} />)
    expect(screen.getAllByTestId(/^suite3d-/).filter((el) => el.tabIndex === 0)).toHaveLength(1)
    await user.tab()
    expect(screen.getByTestId('suite3d-odt-1200')).toHaveFocus()
    expect(focus).toHaveBeenLastCalledWith('odt-1200')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByTestId('suite3d-odt-1100')).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByTestId('suite3d-odt-1110')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'select', selection: { kind: 'suite', suiteId: 'odt-1110' } })
    await user.keyboard('{Escape}')
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'select', selection: null })
    await user.tab()
    expect(focus).toHaveBeenLastCalledWith(null)
  })

  it('a click (assistive technology activation) selects the suite', async () => {
    const user = userEvent.setup()
    const { dispatch } = renderWith(<MirrorHarness />)
    await user.click(screen.getByTestId('suite3d-odt-500'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: { kind: 'suite', suiteId: 'odt-500' } })
  })
})
