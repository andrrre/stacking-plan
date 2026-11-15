import type { ReactElement } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initState } from '../../app/state/init'
import { AppStateContext } from '../../app/state/useAppState'
import type { Action, AppState } from '../../app/state/types'
import { StackView } from '../stack/StackView'
import { Stack3D } from './Stack3D'
import { ViewSwitch } from './ViewSwitch'
import { mirrorKeys } from './mirrorKeys'

const TODAY = '2026-11-15'

function renderWith(ui: ReactElement, over: Partial<AppState> = {}) {
  const state: AppState = { ...initState('', null, TODAY), ...over }
  const dispatch = vi.fn<(a: Action) => void>()
  const utils = render(<AppStateContext.Provider value={{ state, dispatch }}>{ui}</AppStateContext.Provider>)
  return { ...utils, dispatch }
}

const attrs = (el: Element) => ({
  status: el.getAttribute('data-status'), overlay: el.getAttribute('data-overlay'), fill: el.getAttribute('data-fill'),
  risk: el.getAttribute('data-risk'), rank: el.getAttribute('data-match-rank'), dimmed: el.getAttribute('data-dimmed'),
  modified: el.getAttribute('data-modified'),
})

describe('Stack3D', () => {
  it('renders 32 suite3d buttons inside stack-3d', () => {
    renderWith(<Stack3D />)
    expect(screen.getByTestId('stack-3d')).toBeInTheDocument()
    expect(screen.getAllByTestId(/^suite3d-/)).toHaveLength(32)
  })

  it('every suite has the same data-* attributes and accessible name as in 2D', () => {
    const over: Partial<AppState> = { mode: 'risk', req: { ...initState('', null, TODAY).req, minSf: 10_000 } }
    const two = renderWith(<StackView />, over)
    const flat = new Map(screen.getAllByTestId(/^suite-/).map((el) => [el.getAttribute('data-testid')?.replace('suite-', ''), [attrs(el), el.getAttribute('aria-label')]]))
    two.unmount()
    renderWith(<Stack3D />, over)
    const els = screen.getAllByTestId(/^suite3d-/)
    expect(els).toHaveLength(flat.size)
    for (const el of els) {
      const id = el.getAttribute('data-testid')?.replace('suite3d-', '')
      expect([attrs(el), el.getAttribute('aria-label')], String(id)).toEqual(flat.get(id))
    }
  })

  it('draws the numbered match outlines', () => {
    renderWith(<Stack3D />, { req: { ...initState('', null, TODAY).req, minSf: 10_000 } })
    expect(screen.getByTestId('match-outline-1')).toBeInTheDocument()
    expect(screen.getByTestId('suite3d-odt-500')).toHaveAttribute('data-match-rank', '1')
  })

  it('clicking a suite selects it and rotating dispatches nothing', async () => {
    const user = userEvent.setup()
    const { dispatch } = renderWith(<Stack3D />)
    await user.click(screen.getByRole('button', { name: 'Rotate view right' }))
    await user.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(dispatch).not.toHaveBeenCalled()
    await user.click(screen.getByTestId('suite3d-odt-500'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: { kind: 'suite', suiteId: 'odt-500' } })
  })

  it('Enter on a focused suite selects it', async () => {
    const user = userEvent.setup()
    const { dispatch } = renderWith(<Stack3D />)
    screen.getByTestId('suite3d-odt-500').focus()
    await user.keyboard('{Enter}')
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: { kind: 'suite', suiteId: 'odt-500' } })
  })
})

describe('ViewSwitch', () => {
  it('shows the 2D stack for view=stack and the 3D view for view=3d', () => {
    const a = renderWith(<ViewSwitch />, { view: 'stack' })
    expect(screen.getByTestId('stack')).toBeInTheDocument()
    expect(screen.queryByTestId('stack-3d')).toBeNull()
    a.unmount()
    renderWith(<ViewSwitch />, { view: '3d' })
    expect(screen.getByTestId('stack-3d')).toBeInTheDocument()
    expect(screen.queryByTestId('stack')).toBeNull()
  })
})

describe('3D keyboard and controls', () => {
  it('Left and Right follow the screen once the building is turned past 90 degrees', async () => {
    const user = userEvent.setup()
    renderWith(<Stack3D />)
    screen.getByTestId('suite3d-odt-1110').focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByTestId('suite3d-odt-1120')).toHaveFocus()
    for (let i = 0; i < 9; i++) await user.click(screen.getByRole('button', { name: 'Rotate view right' }))
    screen.getByTestId('suite3d-odt-1110').focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByTestId('suite3d-odt-1100')).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByTestId('suite3d-odt-1000')).toHaveFocus()
  })

  it('mirrorKeys swaps only Left/Right, and only past a quarter turn', () => {
    const seen: string[] = []
    const props = { tabIndex: 0 as const, ref: () => {}, onFocus: () => {}, onKeyDown: (e: { key: string }) => void seen.push(e.key) }
    const ev = (key: string) => ({ key }) as never
    mirrorKeys(props, -35).onKeyDown(ev('ArrowLeft'))
    mirrorKeys(props, 100).onKeyDown(ev('ArrowLeft'))
    mirrorKeys(props, 100).onKeyDown(ev('ArrowRight'))
    mirrorKeys(props, 100).onKeyDown(ev('ArrowUp'))
    expect(seen).toEqual(['ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowUp'])
  })

  it('Reset view is aria-disabled (still focusable) at the default angle and live after a turn', async () => {
    const user = userEvent.setup()
    renderWith(<Stack3D />)
    const reset = screen.getByRole('button', { name: 'Reset view' })
    expect(reset).toHaveAttribute('aria-disabled', 'true')
    expect(reset).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Rotate view right' }))
    expect(reset).toHaveAttribute('aria-disabled', 'false')
    for (let i = 0; i < 23; i++) await user.click(screen.getByRole('button', { name: 'Rotate view right' }))
    expect(reset).toHaveAttribute('aria-disabled', 'true') // 24 x 15 = one full turn
  })

  it('narrow suites (30 on a floor) hide their chip unless selected', () => {
    const suites = Array.from({ length: 30 }, (_, k) => ({
      id: `w-${k}`, number: String(100 + k), areaSf: 1000, kind: 'leasable' as const, askingRentPsf: 40, joinsNext: false, leases: [],
    }))
    const building = { id: 'wide', name: 'Wide', address: 'x', floors: [{ number: 1, suites }] }
    renderWith(<Stack3D />, { importedBuildings: [building], buildingId: 'wide', selection: { kind: 'suite', suiteId: 'w-3' } })
    const chip = (id: string) => screen.getByTestId(`suite3d-${id}`).nextElementSibling
    expect(chip('w-0')).toHaveAttribute('data-narrow', 'true')
    expect(chip('w-3')).toHaveAttribute('data-narrow', 'false')
  })

  it('number chips carry the 2D status glyphs: a clock when expiring, a lock when committed', () => {
    renderWith(<Stack3D />)
    const chip = (n: string) => screen.getByTestId(`suite3d-odt-${n}`).nextElementSibling
    for (const n of ['600', '400', '220', '1000']) {
      expect(chip(n), n).toHaveAttribute('data-cue', 'clock')
      expect(chip(n)?.querySelector('svg'), n).not.toBeNull()
    }
    expect(chip('1010')).toHaveAttribute('data-cue', 'lock')
    expect(chip('1010')?.querySelector('svg')).not.toBeNull()
    for (const n of ['500', '900', '100']) {
      expect(chip(n), n).not.toHaveAttribute('data-cue')
      expect(chip(n)?.querySelector('svg'), n).toBeNull()
    }
    expect(chip('600')).toHaveTextContent(/^600$/) // the glyph adds no text: the date stays in the label and tooltip
  })

  it('the hero has no narrow suites', () => {
    renderWith(<Stack3D />)
    expect(document.querySelectorAll('[data-narrow="true"]')).toHaveLength(0)
  })

  it('ViewSwitch keeps the angle across a 2D round trip', async () => {
    const user = userEvent.setup()
    const state = (view: AppState['view']): AppState => ({ ...initState('', null, TODAY), view })
    const dispatch = vi.fn<(a: Action) => void>()
    const tree = (view: AppState['view']) => (
      <AppStateContext.Provider value={{ state: state(view), dispatch }}><ViewSwitch /></AppStateContext.Provider>
    )
    const { rerender } = render(tree('3d'))
    await user.click(screen.getByRole('button', { name: 'Rotate view right' }))
    rerender(tree('stack'))
    rerender(tree('3d'))
    expect(screen.getByTestId('stack-3d').style.getPropertyValue('--rot')).toBe('-20deg')
  })
})
