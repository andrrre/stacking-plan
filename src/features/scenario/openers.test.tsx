import { describe, it, expect, beforeAll } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import type { AppState } from '../../app/state/types'
import { useAppState } from '../../app/state/useAppState'
import { BUNDLED_BUILDINGS } from '../../data'
import { findFits } from '../../domain/findFits'
import { statusAt } from '../../domain/status'
import type { Candidate, Suite } from '../../domain/types'
import { RightPanel } from '../layout/RightPanel'
import { PlaceTenant } from './PlaceTenant'
import { SuiteActions } from './SuiteActions'

const TODAY = '2026-11-15'
const hero = BUNDLED_BUILDINGS[0]

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open') }
})

function heroSuite(n: string): Suite {
  const s = hero.floors.flatMap((f) => f.suites).find((x) => x.number === n)
  if (!s) throw new Error(`no suite ${n}`)
  return s
}

/** Shows the reducer's changes and selection so a test can see what was dispatched. */
function Probe() {
  const { state } = useAppState()
  return <output data-testid="probe">{JSON.stringify({ changes: state.changes, selection: state.selection })}</output>
}
const probe = () => JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as Pick<AppState, 'changes' | 'selection'>

function renderActions(n: string, asOf = TODAY) {
  const s = heroSuite(n)
  render(
    <StateProvider initialState={{ ...initState('', null, TODAY), asOf }}>
      <SuiteActions suite={s} st={statusAt(s, asOf, TODAY)} asOf={asOf} />
      <Probe />
    </StateProvider>,
  )
}

describe('SuiteActions', () => {
  it('a leased suite offers renew and vacate, not a new lease', () => {
    renderActions('600')
    expect(screen.getByTestId('action-renew')).toBeEnabled()
    expect(screen.getByTestId('action-vacate')).toBeEnabled()
    expect(screen.queryByTestId('action-lease')).toBeNull()
  })

  it('renew is disabled for the open-ended 230; vacate defaults to D', async () => {
    renderActions('230', '2027-07-01')
    expect(screen.getByTestId('action-renew')).toBeDisabled()
    await userEvent.click(screen.getByTestId('action-vacate'))
    expect(screen.getByLabelText('Vacate on')).toHaveValue('2027-07-01')
  })

  it('renew 600 adds the change and returns focus to the button', async () => {
    renderActions('600')
    await userEvent.click(screen.getByTestId('action-renew'))
    expect(screen.getByLabelText('New end date')).toHaveValue('2032-04-30')
    await userEvent.click(screen.getByTestId('change-submit'))
    expect(screen.queryByTestId('change-dialog')).toBeNull()
    expect(probe().changes).toEqual([{ kind: 'renew', leaseId: 'odt-600-l1', newEnd: '2032-04-30' }])
    expect(screen.getByTestId('action-renew')).toHaveFocus()
  })

  it('a vacant suite offers a new lease only', async () => {
    renderActions('1010')
    expect(screen.queryByTestId('action-renew')).toBeNull()
    await userEvent.click(screen.getByTestId('action-lease'))
    expect(screen.getByLabelText('Tenant')).toHaveValue('Prospect')
    expect(screen.getByLabelText(/Rent/)).toHaveValue('56')
  })

  it('potential space offers renew and vacate on the ended lease, and a new lease', async () => {
    renderActions('600', '2027-07-01')
    expect(screen.getByTestId('action-lease')).toBeEnabled()
    await userEvent.click(screen.getByTestId('action-vacate'))
    expect(screen.getByLabelText('Vacate on')).toHaveValue('2027-04-30')
  })

  it('common areas have no actions', () => {
    renderActions('100')
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('PlaceTenant', () => {
  function renderPlace(c: Candidate, asOf = TODAY) {
    const state: AppState = { ...initState('', null, TODAY), asOf, selection: { kind: 'match', key: c.key } }
    render(
      <StateProvider initialState={state}>
        <PlaceTenant candidate={c} />
        <Probe />
      </StateProvider>,
    )
  }
  const fit = (key: string, asOf = TODAY) => {
    const c = findFits(hero, { minSf: 10_000, includePotential: true }, asOf, TODAY).find((x) => x.key === key)
    if (!c) throw new Error(`no ${key}`)
    return c
  }

  it('single suite: places Prospect on 500 and selects the suite', async () => {
    renderPlace(fit('odt-500'))
    await userEvent.click(screen.getByTestId('place-tenant'))
    expect(screen.getByTestId('change-dialog')).toHaveTextContent('Suite 500')
    await userEvent.click(screen.getByTestId('change-submit'))
    expect(probe()).toEqual({
      changes: [{ kind: 'newLease', suiteIds: ['odt-500'], tenant: 'Prospect', start: TODAY, end: '2031-11-14', rentPsf: 48 }],
      selection: { kind: 'suite', suiteId: 'odt-500' },
    })
  })

  it('multi-suite: places on 700 + 710 at the blended rent', async () => {
    const c = fit('odt-700+odt-710')
    renderPlace(c)
    await userEvent.click(screen.getByTestId('place-tenant'))
    expect(screen.getByTestId('change-dialog')).toHaveTextContent('Suites 700 + 710')
    await userEvent.click(screen.getByTestId('change-submit'))
    expect(probe().changes).toEqual([{
      kind: 'newLease', suiteIds: ['odt-700', 'odt-710'], tenant: 'Prospect', start: TODAY, end: '2031-11-14', rentPsf: c.blendedRentPsf,
    }])
  })

  it('cancel keeps the match selected', async () => {
    const c = fit('odt-500')
    renderPlace(c)
    await userEvent.click(screen.getByTestId('place-tenant'))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(probe()).toEqual({ changes: [], selection: { kind: 'match', key: 'odt-500' } })
    expect(screen.getByTestId('place-tenant')).toHaveFocus()
  })

  it('after placing, focus moves to the placed suite\'s details heading', async () => {
    const state: AppState = {
      ...initState('', null, TODAY), req: { minSf: 10_000, maxSf: null, maxRentPsf: null, includePotential: true },
      selection: { kind: 'match', key: 'odt-500' },
    }
    render(<StateProvider initialState={state}><RightPanel /></StateProvider>)
    await userEvent.click(screen.getByTestId('place-tenant'))
    await userEvent.click(screen.getByTestId('change-submit'))
    expect(screen.getByRole('heading', { name: 'Suite 500' })).toHaveFocus()
  })

  it('Escape in the dialog returns focus to Place tenant here', async () => {
    renderPlace(fit('odt-500'))
    await userEvent.click(screen.getByTestId('place-tenant'))
    fireEvent(screen.getByTestId('change-dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByTestId('change-dialog')).toBeNull()
    expect(screen.getByTestId('place-tenant')).toHaveFocus()
  })
})
