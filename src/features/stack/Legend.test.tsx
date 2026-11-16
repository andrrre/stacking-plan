import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import { useAppState } from '../../app/state/useAppState'
import { Legend } from './Legend'

const TODAY = '2026-11-15'

function Probe() {
  const { state } = useAppState()
  return <output data-testid="probe">{state.legend ?? 'none'}</output>
}

function renderLegend(search = '') {
  render(
    <StateProvider initialState={initState(search, null, TODAY)}>
      <Legend />
      <Probe />
    </StateProvider>,
  )
}

const pills = (testId: string) => within(screen.getByTestId(testId)).getAllByTestId('legend-pill')

describe('Legend', () => {
  it('availability: a pill per status with its swatch, name and "N suites · X SF"', () => {
    renderLegend()
    const all = pills('legend')
    expect(all.map((p) => p.getAttribute('data-key'))).toEqual(['vacant', 'potential', 'expiring', 'committed', 'occupied', 'common'])
    expect(all[0]).toHaveTextContent('Vacant6 suites · 35,150 SF')
    expect(all[3]).toHaveTextContent('Committed1 suite · 3,000 SF')
    expect(all.map((p) => p.querySelector('[data-fill]')?.getAttribute('data-fill'))).toEqual(all.map((p) => p.getAttribute('data-key')))
    expect(screen.getByTestId('legend-assumption')).toHaveTextContent('A lease that ends is assumed not renewed: shown as potential')
  })

  it('pressing a pill filters, pressing it again clears, pressing another switches', async () => {
    renderLegend()
    const [vacant, , expiring] = pills('legend')
    await userEvent.click(vacant as HTMLElement)
    expect(vacant).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('probe')).toHaveTextContent('vacant')
    await userEvent.click(expiring as HTMLElement)
    expect(vacant).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('probe')).toHaveTextContent('expiring')
    await userEvent.click(expiring as HTMLElement)
    expect(screen.getByTestId('probe')).toHaveTextContent('none')
  })

  it('a status no suite has is an aria-disabled pill that stays focusable and ignores clicks', async () => {
    renderLegend()
    const potential = pills('legend').find((p) => p.getAttribute('data-key') === 'potential') as HTMLElement
    expect(potential).toHaveAttribute('aria-disabled', 'true')
    expect(potential).toBeEnabled()
    expect(potential).toHaveTextContent('0 suites')
    await userEvent.click(potential)
    expect(screen.getByTestId('probe')).toHaveTextContent('none')
    expect(potential).toHaveAttribute('aria-pressed', 'false')
  })

  it('a pressed pill whose suites are gone stays pressed with "0 suites"; un-pressing it keeps focus on it', async () => {
    renderLegend('?legend=potential')
    const potential = pills('legend').find((p) => p.getAttribute('data-key') === 'potential') as HTMLElement
    expect(potential).toHaveAttribute('aria-pressed', 'true')
    expect(potential).not.toHaveAttribute('aria-disabled')
    expect(potential).toHaveTextContent('0 suites')
    await userEvent.click(potential)
    expect(screen.getByTestId('probe')).toHaveTextContent('none')
    expect(potential).toHaveAttribute('aria-disabled', 'true')
    expect(potential).toHaveFocus()
  })

  it('lease risk mode shows the risk ramp as pills that filter the same way', async () => {
    renderLegend('?mode=risk')
    const all = pills('legend-risk')
    expect(all.map((p) => p.textContent?.split(/\d/)[0])).toEqual([
      'Vacant', 'Potential', 'Committed', '≤ ', '≤ ', '≤ ', '≤ ', 'Over ', 'No end date', 'Common area',
    ])
    const le6 = all.find((p) => p.getAttribute('data-key') === 'risk-le6') as HTMLElement
    expect(le6).toHaveTextContent('≤ 6 months1 suite · 12,400 SF')
    await userEvent.click(le6)
    expect(screen.getByTestId('probe')).toHaveTextContent('risk-le6')
  })
})
