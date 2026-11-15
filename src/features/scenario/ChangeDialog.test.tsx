import { describe, it, expect, vi, beforeAll } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initState } from '../../app/state/init'
import type { Action, AppState } from '../../app/state/types'
import { AppStateContext } from '../../app/state/useAppState'
import type { Change } from '../../domain/types'
import { ChangeDialog } from './ChangeDialog'

const TODAY = '2026-11-15'
const place: Change = { kind: 'newLease', suiteIds: ['odt-500'], tenant: 'Prospect', start: TODAY, end: '2031-11-14', rentPsf: 48 }

// jsdom has no modal dialog support: open/close toggle the attribute, as the browser does.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open') }
})

function renderDialog(initial: Change, over: Partial<AppState> = {}) {
  const state: AppState = { ...initState('', null, TODAY), ...over }
  const dispatch = vi.fn<(a: Action) => void>()
  const onClose = vi.fn<(applied: boolean) => void>()
  render(
    <AppStateContext.Provider value={{ state, dispatch }}>
      <ChangeDialog initial={initial} onClose={onClose} />
    </AppStateContext.Provider>,
  )
  return { dispatch, onClose }
}

const submit = () => userEvent.click(screen.getByTestId('change-submit'))

describe('ChangeDialog', () => {
  it('opens prefilled for a new lease on 500', () => {
    renderDialog(place)
    const dialog = screen.getByTestId('change-dialog')
    expect(dialog).toHaveAttribute('open')
    expect(dialog).toHaveTextContent('Suite 500')
    expect(screen.getByLabelText('Tenant')).toHaveValue('Prospect')
    expect(screen.getByLabelText('Start')).toHaveValue(TODAY)
    expect(screen.getByLabelText('End')).toHaveValue('2031-11-14')
    expect(screen.getByLabelText(/Rent/)).toHaveValue('48')
  })

  it('submitting adds the change and closes as applied', async () => {
    const { dispatch, onClose } = renderDialog(place)
    await submit()
    expect(dispatch).toHaveBeenCalledWith({ type: 'scenario/add', change: place })
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('keeps an exact blended rent when the rent field is untouched', async () => {
    const blended: Change = { ...place, suiteIds: ['odt-700', 'odt-710'], rentPsf: 547_900 / 10_500 }
    const { dispatch } = renderDialog(blended)
    expect(screen.getByLabelText(/Rent/)).toHaveValue('52.18')
    await submit()
    expect(dispatch).toHaveBeenCalledWith({ type: 'scenario/add', change: blended })
  })

  it('edited fields go into the change', async () => {
    const { dispatch } = renderDialog(place)
    const tenant = screen.getByLabelText('Tenant')
    await userEvent.clear(tenant)
    await userEvent.type(tenant, '  Reef & Co  ')
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2027-01-01' } })
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2031-12-31' } })
    const rent = screen.getByLabelText(/Rent/)
    await userEvent.clear(rent)
    await userEvent.type(rent, '50.5')
    await submit()
    expect(dispatch).toHaveBeenCalledWith({
      type: 'scenario/add',
      change: { ...place, tenant: 'Reef & Co', start: '2027-01-01', end: '2031-12-31', rentPsf: 50.5 },
    })
  })

  it('an overlapping lease shows the scenario error and stays open', async () => {
    const { dispatch, onClose } = renderDialog({ ...place, suiteIds: ['odt-1010'], start: '2027-01-01', end: '2031-12-31' })
    await submit()
    expect(screen.getByTestId('change-error')).toHaveTextContent('Suite 1010 is leased to Bayfront Dental Group')
    expect(screen.getByTestId('change-dialog')).toHaveAttribute('open')
    expect(dispatch).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('validates against the changes already in the scenario', async () => {
    const { dispatch } = renderDialog(place, { changes: [place] })
    await submit()
    expect(screen.getByTestId('change-error')).toHaveTextContent('Suite 500 is leased to Prospect')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it.each([
    ['Tenant', '', 'Enter a tenant name.'],
    ['Tenant', 'x'.repeat(81), 'at most 80 characters'],
    ['Rent', '0', 'between $1 and $1,000'],
    ['Rent', '1001', 'between $1 and $1,000'],
    ['Rent', 'abc', 'Enter the rent'],
  ])('rejects %s = %j', async (field, value, message) => {
    const { dispatch } = renderDialog(place)
    const input = screen.getByLabelText(new RegExp(`^${field}`))
    await userEvent.clear(input)
    if (value) fireEvent.change(input, { target: { value } })
    await submit()
    expect(screen.getByTestId('change-error')).toHaveTextContent(message)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it.each([0.999, 1000.004])('rejects an untouched prefilled rent of %s (outside 1 to 1,000)', async (rentPsf) => {
    const { dispatch } = renderDialog({ ...place, rentPsf })
    await submit()
    expect(screen.getByTestId('change-error')).toHaveTextContent('between $1 and $1,000')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('rejects a missing date and an end before the start', async () => {
    const { dispatch } = renderDialog(place)
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '' } })
    await submit()
    expect(screen.getByTestId('change-error')).toHaveTextContent('Enter a real start date.')
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2032-01-01' } })
    await submit()
    expect(screen.getByTestId('change-error')).toHaveTextContent('The end must not be before the start.')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('renew: prefilled new end, applies', async () => {
    const renew: Change = { kind: 'renew', leaseId: 'odt-600-l1', newEnd: '2032-04-30' }
    const { dispatch } = renderDialog(renew)
    expect(screen.getByTestId('change-dialog')).toHaveTextContent('Flamingo Row Media')
    expect(screen.getByLabelText('New end date')).toHaveValue('2032-04-30')
    await submit()
    expect(dispatch).toHaveBeenCalledWith({ type: 'scenario/add', change: renew })
  })

  it('renew to an earlier date shows the error', async () => {
    renderDialog({ kind: 'renew', leaseId: 'odt-600-l1', newEnd: '2032-04-30' })
    fireEvent.change(screen.getByLabelText('New end date'), { target: { value: '2027-01-31' } })
    await submit()
    expect(screen.getByTestId('change-error')).toHaveTextContent('after the current end (30 Apr 2027)')
  })

  it('vacate: prefilled date, applies', async () => {
    const vacate: Change = { kind: 'vacate', leaseId: 'odt-600-l1', on: '2027-04-30' }
    const { dispatch } = renderDialog(vacate)
    expect(screen.getByLabelText('Vacate on')).toHaveValue('2027-04-30')
    await submit()
    expect(dispatch).toHaveBeenCalledWith({ type: 'scenario/add', change: vacate })
  })

  it('Cancel and Escape close without applying', async () => {
    const { dispatch, onClose } = renderDialog(place)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenLastCalledWith(false)
    fireEvent(screen.getByTestId('change-dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onClose).toHaveBeenLastCalledWith(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('returns focus to the element that opened it', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    renderDialog(place)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(opener).toHaveFocus()
    opener.remove()
  })
})
