import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import { useAppState } from '../../app/state/useAppState'
import { BuildingSwitcher } from './BuildingSwitcher'

function Probe() {
  const { state } = useAppState()
  return <output data-testid="probe">{`${state.buildingId}|${state.selection ? 'sel' : 'none'}`}</output>
}

function renderSwitcher() {
  const initial = { ...initState('', null, '2026-11-15'), selection: { kind: 'suite' as const, suiteId: 'odt-500' } }
  render(<StateProvider initialState={initial}><BuildingSwitcher /><Probe /></StateProvider>)
}

describe('BuildingSwitcher', () => {
  it('lists both bundled buildings with the current one selected', () => {
    renderSwitcher()
    const select = screen.getByLabelText('Building')
    expect(select).toHaveAttribute('data-testid', 'building-switcher')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Ocean Drive Tower', 'Palm Bay Plaza'])
    expect(select).toHaveValue('odt')
  })

  it('switching dispatches building/set, which clears the selection', async () => {
    renderSwitcher()
    expect(screen.getByTestId('probe')).toHaveTextContent('odt|sel')
    await userEvent.selectOptions(screen.getByLabelText('Building'), 'pbp')
    expect(screen.getByTestId('probe')).toHaveTextContent('pbp|none')
  })
})
