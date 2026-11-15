import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import { useAppState } from '../../app/state/useAppState'
import type { AppState } from '../../app/state/types'
import { SuiteDetails } from './SuiteDetails'

const TODAY = '2026-11-15'

function renderDetails(number: string, over: Partial<AppState> = {}) {
  const base = initState('', null, TODAY)
  const state: AppState = { ...base, selection: { kind: 'suite', suiteId: `odt-${number}` }, ...over }
  return render(
    <StateProvider initialState={state}>
      <SuiteDetails suiteId={`odt-${number}`} />
    </StateProvider>,
  )
}

describe('SuiteDetails', () => {
  it('600: tenant, size, rent, end date, status and months remaining', () => {
    renderDetails('600')
    const panel = screen.getByTestId('suite-details')
    expect(panel).toHaveTextContent('Suite 600')
    expect(panel).toHaveTextContent('Flamingo Row Media')
    expect(panel).toHaveTextContent('12,400 SF')
    expect(panel).toHaveTextContent('$48.00')
    expect(panel).toHaveTextContent('1 May 2017')
    expect(panel).toHaveTextContent('30 Apr 2027')
    expect(panel).toHaveTextContent('Expiring')
    expect(panel).toHaveTextContent('5 months')
  })

  it('700 can combine with 710; 300 cannot combine', () => {
    renderDetails('700')
    expect(screen.getByTestId('suite-details')).toHaveTextContent('Can combine with 710')
  })

  it('300 cannot combine', () => {
    renderDetails('300')
    expect(screen.getByTestId('suite-details')).toHaveTextContent('Cannot combine')
  })

  it('a middle suite lists both neighbours', () => {
    renderDetails('1110')
    expect(screen.getByTestId('suite-details')).toHaveTextContent('Can combine with 1100, 1120')
  })

  it('1010 lists the upcoming Bayfront Dental Group lease', () => {
    renderDetails('1010')
    const panel = screen.getByTestId('suite-details')
    expect(panel).toHaveTextContent('Bayfront Dental Group')
    expect(panel).toHaveTextContent('1 Mar 2027')
    expect(panel).toHaveTextContent('Leased from 03/2027')
  })

  it('400 is expiring and vacating: shows when it becomes vacant', () => {
    renderDetails('400')
    expect(screen.getByTestId('suite-details')).toHaveTextContent('Expiring · Vacant from 06/2027')
  })

  it('a committed suite shows no asking rent', () => {
    renderDetails('1010')
    expect(screen.getByTestId('suite-details')).not.toHaveTextContent('Asking rent')
  })

  it('230 has no end date', () => {
    renderDetails('230')
    const panel = screen.getByTestId('suite-details')
    expect(panel).toHaveTextContent('No end date')
    expect(panel).toHaveTextContent('Occupied')
  })

  it('a vacant suite shows its asking rent', () => {
    renderDetails('410')
    const panel = screen.getByTestId('suite-details')
    expect(panel).toHaveTextContent('Asking rent')
    expect(panel).toHaveTextContent('$46.00')
    expect(panel).toHaveTextContent('Vacant')
  })

  it('a potential suite says so and names the ending lease', () => {
    renderDetails('600', { asOf: '2027-07-01' })
    const panel = screen.getByTestId('suite-details')
    expect(panel).toHaveTextContent('Potential')
    expect(panel).toHaveTextContent('Flamingo Row Media')
  })

  it('a common suite has no rent or combine rows', () => {
    renderDetails('100')
    const panel = screen.getByTestId('suite-details')
    expect(panel).toHaveTextContent('Common area')
    expect(panel).not.toHaveTextContent('Asking rent')
  })

  it('renders nothing for an unknown suite id', () => {
    const { container } = render(
      <StateProvider initialState={initState('', null, TODAY)}>
        <SuiteDetails suiteId="nope" />
      </StateProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('Close clears the selection', async () => {
    function Probe() {
      return <output data-testid="probe">{String(useAppState().state.selection)}</output>
    }
    render(
      <StateProvider initialState={{ ...initState('', null, TODAY), selection: { kind: 'suite', suiteId: 'odt-600' } }}>
        <SuiteDetails suiteId="odt-600" />
        <Probe />
      </StateProvider>,
    )
    expect(screen.getByTestId('probe')).toHaveTextContent('[object Object]')
    await userEvent.click(screen.getByRole('button', { name: 'Close details' }))
    expect(screen.getByTestId('probe')).toHaveTextContent('null')
  })
})
