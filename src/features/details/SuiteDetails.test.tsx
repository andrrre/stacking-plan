import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import { useAppState } from '../../app/state/useAppState'
import type { AppState } from '../../app/state/types'
import { SuiteDetails } from './SuiteDetails'

/** What the details' actions change in app state, rendered for the assertions. */
function Probe() {
  const { state } = useAppState()
  const selected = state.selection?.kind === 'suite' ? state.selection.suiteId : 'none'
  return <output data-testid="probe">{`${selected}|${state.view}|${state.floor ?? 'none'}|${state.shortlist.length}`}</output>
}

const TODAY = '2026-11-15'

function renderDetails(number: string, over: Partial<AppState> = {}) {
  const base = initState('', null, TODAY)
  const state: AppState = { ...base, selection: { kind: 'suite', suiteId: `odt-${number}` }, ...over }
  return render(
    <StateProvider initialState={state}>
      <SuiteDetails suiteId={`odt-${number}`} />
      <Probe />
    </StateProvider>,
  )
}

const cell = (id: string) => screen.getByTestId(id).textContent

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

  describe('the handoff layout', () => {
    it('vacant 700: chip, "Available for lease", Floor / Size / Lease / Contiguous on floor', () => {
      renderDetails('700')
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Suite 700')
      expect(cell('suite-chip')).toBe('Vacant')
      expect(cell('suite-tenant')).toBe('Available for lease')
      expect([cell('fact-floor'), cell('fact-size'), cell('fact-lease'), cell('fact-contiguous')]).toEqual(['7', '4,300 SF', 'Available now', '10,500 SF'])
    })

    it('expiring 600: tenant, "Ends 04/2027", no contiguous space', () => {
      renderDetails('600')
      expect(cell('suite-chip')).toBe('Expiring ≤ 12 mo')
      expect(cell('suite-tenant')).toBe('Flamingo Row Media')
      expect(cell('fact-lease')).toBe('Ends 04/2027')
      expect(cell('fact-contiguous')).toBe('—')
    })

    it('potential 600 in July 2027: "previously" the tenant, "Ended 04/2027"', () => {
      renderDetails('600', { asOf: '2027-07-01' })
      expect(cell('suite-chip')).toBe('Potential')
      expect(cell('suite-tenant')).toBe('Potential availability · previously Flamingo Row Media')
      expect(cell('fact-lease')).toBe('Ended 04/2027')
      expect(cell('fact-contiguous')).toBe('12,400 SF')
    })

    it('committed 1010: "Starts 03/2027"', () => {
      renderDetails('1010')
      expect(cell('suite-chip')).toBe('Committed')
      expect(cell('fact-lease')).toBe('Starts 03/2027')
    })
  })

  describe('Add to client summary', () => {
    it('adds an available suite to the shortlist, then offers to remove it', async () => {
      renderDetails('700')
      const button = screen.getByTestId('add-to-summary')
      expect(button).toHaveTextContent('Add to client summary')
      await userEvent.click(button)
      expect(screen.getByTestId('probe')).toHaveTextContent(/\|1$/)
      expect(button).toHaveTextContent('Remove from client summary')
      expect(button).toHaveAttribute('data-saved', 'true')
      await userEvent.click(button)
      expect(screen.getByTestId('probe')).toHaveTextContent(/\|0$/)
    })

    it('is unavailable, with the reason, for space that is not available', () => {
      renderDetails('900')
      expect(screen.getByTestId('add-to-summary')).toBeDisabled()
      expect(screen.getByTestId('add-to-summary')).toHaveAttribute('title', 'Only available space can go in the client summary')
    })
  })

  it('Floor plan opens the 3D floor view on the suite\'s floor, from the 2D stack too', async () => {
    renderDetails('700', { view: 'stack' })
    await userEvent.click(screen.getByTestId('open-floor-plan'))
    expect(screen.getByTestId('probe')).toHaveTextContent('odt-700|3d|7|0')
  })

  it('"Floor N at a glance" lists the floor\'s suites, marks the current one and selects on click', async () => {
    renderDetails('700')
    const glance = screen.getByTestId('floor-glance')
    expect(glance).toHaveTextContent('Floor 7 at a glance')
    const rows = within(glance).getAllByRole('button')
    expect(rows.map((r) => r.textContent)).toEqual(['700Vacant4,300 SF', '710Vacant6,200 SF', '720Halcyon Tide Realty1,900 SF'])
    expect(rows[0]).toHaveAttribute('aria-current', 'true')
    expect(rows[1]).not.toHaveAttribute('aria-current')
    await userEvent.click(rows[2] as HTMLElement)
    expect(screen.getByTestId('probe')).toHaveTextContent(/^odt-720\|/)
  })
})
