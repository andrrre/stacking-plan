import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import { Header } from './Header'

const renderHeader = (presenting: boolean) =>
  render(<StateProvider initialState={{ ...initState('', null, '2026-11-15'), presenting }}><Header /></StateProvider>)

describe('Header while presenting', () => {
  it('keeps to presentation actions: no Import CSV or CSV template (the header stays one row with Tour in it)', () => {
    renderHeader(true)
    expect(screen.queryByTestId('import-template')).toBeNull()
    expect(screen.queryByRole('button', { name: /Import CSV/ })).toBeNull()
    expect(screen.getByTestId('tour')).toBeInTheDocument()
  })

  it('brings them back when the presentation ends', () => {
    renderHeader(false)
    expect(screen.getByTestId('import-template')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Import CSV/ })).toBeInTheDocument()
  })
})

describe('Header actions', () => {
  it('has one Tour button and no Present button', () => {
    renderHeader(false)
    expect(screen.getByTestId('tour')).toHaveTextContent(/^Tour$/)
    expect(screen.getAllByRole('button', { name: /Tour/ })).toHaveLength(1)
    expect(screen.queryByTestId('present')).toBeNull()
    expect(screen.queryByRole('button', { name: /Present/ })).toBeNull()
  })
})
