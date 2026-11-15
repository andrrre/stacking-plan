import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import { useAppState } from '../../app/state/useAppState'
import { BuildingSwitcher } from './BuildingSwitcher'
import { building } from '../../domain/testing/fixtures'
import type { ShortlistEntry } from '../../domain/types'

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

describe('BuildingSwitcher: removing an imported building', () => {
  const own = building({ id: 'csv-own', name: 'Bayfront Commons' })

  function ImportedProbe() {
    const { state } = useAppState()
    return <output data-testid="imported">{`${state.buildingId}|${state.importedBuildings.map((b) => b.id).join(',')}|${state.shortlist.length}`}</output>
  }

  function renderImported(buildingId = 'csv-own') {
    const base = initState('', null, '2026-11-15')
    const entry = { id: 'csv-own|k', buildingId: 'csv-own' } as ShortlistEntry
    const initial = { ...base, buildingId, importedBuildings: [own], shortlist: [entry] }
    render(<StateProvider initialState={initial}><BuildingSwitcher /><ImportedProbe /></StateProvider>)
  }

  it('shows no Remove control for a bundled building', () => {
    renderImported('odt')
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
  })

  it('names the building in the Remove control', () => {
    renderImported()
    expect(screen.getByRole('button', { name: 'Remove Bayfront Commons' })).toBeInTheDocument()
  })

  it('one click does not delete: it asks first, and Cancel keeps the building', async () => {
    renderImported()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Bayfront Commons' }))
    expect(screen.getByTestId('imported')).toHaveTextContent('csv-own|csv-own|1')
    expect(screen.getByText(/Remove Bayfront Commons and its saved options\?/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByTestId('imported')).toHaveTextContent('csv-own|csv-own|1')
    expect(screen.getByRole('button', { name: 'Remove Bayfront Commons' })).toHaveFocus()
  })

  it('Escape cancels the confirm step', async () => {
    renderImported()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Bayfront Commons' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Yes, remove Bayfront Commons' })).toBeNull()
    expect(screen.getByTestId('imported')).toHaveTextContent('csv-own|csv-own|1')
  })

  it('confirming removes the building and its shortlist, switches to the first bundled one and focuses the switcher', async () => {
    renderImported()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Bayfront Commons' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove Bayfront Commons' }))
    expect(screen.getByTestId('imported')).toHaveTextContent('odt||0')
    expect(screen.getByLabelText('Building')).toHaveFocus()
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
  })
})
