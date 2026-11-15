import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import { parseCsv } from '../../domain/csv/parseCsv'
import { CSV_TEMPLATE } from '../../domain/csv/template'
import { Header } from '../layout/Header'

function renderHeader(withImported: boolean) {
  const base = initState('', null, '2026-11-15')
  const parsed = parseCsv(CSV_TEMPLATE, [])
  if (!parsed.ok) throw new Error('template must parse')
  const state = withImported
    ? { ...base, importedBuildings: parsed.buildings, buildingId: parsed.buildings[0]?.id ?? base.buildingId }
    : base
  render(<StateProvider initialState={state}><Header /></StateProvider>)
}

describe('Header demo badge', () => {
  it('shows "Demo data" for a bundled building', () => {
    renderHeader(false)
    expect(screen.getByTestId('demo-badge')).toHaveTextContent('Demo data')
  })

  it('hides it for an imported building', () => {
    renderHeader(true)
    expect(screen.getByLabelText('Building')).toHaveValue('csv-coral-way-plaza')
    expect(screen.queryByTestId('demo-badge')).toBeNull()
  })
})
