import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import type { AppState } from '../../app/state/types'
import { StackView } from '../stack/StackView'
import { KpiBar } from './KpiBar'

const TODAY = '2026-11-15'

function renderBar(over: Partial<AppState> = {}) {
  return render(
    <StateProvider initialState={{ ...initState('', null, TODAY), ...over }}>
      <KpiBar />
    </StateProvider>,
  )
}

describe('KpiBar', () => {
  it('shows the A14 values at today', () => {
    renderBar()
    expect(screen.getByTestId('kpi-occupancy-value')).toHaveTextContent('72%')
    expect(screen.getByTestId('kpi-vacant-value')).toHaveTextContent('38,150 SF')
    expect(screen.getByTestId('kpi-vacant-potential')).toHaveTextContent(/^3,000 SF committed$/)
    expect(screen.getByTestId('kpi-expiring-value')).toHaveTextContent('26,500 SF')
    expect(screen.getByTestId('kpi-expiring-leases')).toHaveTextContent(/^4 leases$/)
    expect(screen.getByTestId('kpi-largest-block-value')).toHaveTextContent('10,500 SF · Floor 7')
    expect(screen.getByTestId('kpi-largest-block-suites')).toHaveTextContent(/^Suites 700 \+ 710$/)
  })

  it('captions the cells as in the Night design', () => {
    renderBar()
    expect(screen.getByTestId('kpi-occupancy')).toHaveTextContent(/^Occupancy/)
    expect(screen.getByTestId('kpi-vacant')).toHaveTextContent(/^Available/)
    expect(screen.getByTestId('kpi-expiring')).toHaveTextContent(/^Expiring ≤ 12 months/)
    expect(screen.getByTestId('kpi-largest-block')).toHaveTextContent(/^Largest contiguous block/)
  })

  it('shows the potential sub-line and the potential-inclusive largest block at 2027-07-01', () => {
    renderBar({ asOf: '2027-07-01' })
    expect(screen.getByTestId('kpi-vacant-value')).toHaveTextContent('53,650 SF')
    expect(screen.getByTestId('kpi-vacant-potential')).toHaveTextContent(/^12,400 SF potential$/)
    expect(screen.getByTestId('kpi-largest-block-value')).toHaveTextContent('12,400 SF · Floor 6')
    expect(screen.getByTestId('kpi-largest-block-suites')).toHaveTextContent(/^Suite 600$/)
  })

  it('shows 0 SF committed when nothing is potential or committed', () => {
    renderBar({ asOf: '2027-03-01' })
    expect(screen.getByTestId('kpi-vacant-value')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-vacant-potential')).toHaveTextContent(/^0 SF committed$/)
  })

  it('counts one lease in the singular', () => {
    renderBar({ asOf: '2031-08-01' })
    expect(screen.getByTestId('kpi-expiring-leases')).toHaveTextContent(/^1 lease$/)
  })

  it('a tile click toggles aria-pressed and a second click clears it', async () => {
    renderBar()
    const tile = screen.getByTestId('kpi-expiring')
    expect(tile).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(tile)
    expect(tile).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(tile)
    expect(tile).toHaveAttribute('aria-pressed', 'false')
  })

  it('only one tile is pressed at a time, and Escape clears it', async () => {
    renderBar()
    await userEvent.click(screen.getByTestId('kpi-vacant'))
    await userEvent.click(screen.getByTestId('kpi-occupancy'))
    expect(screen.getByTestId('kpi-vacant')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('kpi-occupancy')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('kpi-occupancy')).toHaveAttribute('aria-pressed', 'false')
  })

  it('Escape from a form field or dialog leaves the tile pressed; from the body it clears', async () => {
    render(
      <StateProvider initialState={initState('', null, TODAY)}>
        <KpiBar />
        <input aria-label="probe" />
        <dialog open><button type="button">in dialog</button></dialog>
      </StateProvider>,
    )
    await userEvent.click(screen.getByTestId('kpi-vacant'))
    await userEvent.click(screen.getByLabelText('probe'))
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('kpi-vacant')).toHaveAttribute('aria-pressed', 'true')
    screen.getByRole('button', { name: 'in dialog', hidden: true }).focus()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('kpi-vacant')).toHaveAttribute('aria-pressed', 'true')
    ;(document.activeElement as HTMLElement).blur()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('kpi-vacant')).toHaveAttribute('aria-pressed', 'false')
  })

  it('Escape on a selected, focused suite clears the selection only; a second Escape clears the highlight', async () => {
    render(
      <StateProvider initialState={initState('', null, TODAY)}>
        <KpiBar />
        <StackView />
      </StateProvider>,
    )
    await userEvent.click(screen.getByTestId('kpi-vacant'))
    await userEvent.click(screen.getByTestId('suite-odt-500'))
    expect(screen.getByTestId('suite-odt-500')).toHaveFocus()
    expect(screen.getByTestId('suite-odt-500')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('suite-odt-500')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('kpi-vacant')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('kpi-vacant')).toHaveAttribute('aria-pressed', 'false')
  })
})
