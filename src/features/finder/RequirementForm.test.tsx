import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initState } from '../../app/state/init'
import { StateProvider } from '../../app/state/StateProvider'
import type { Action, AppState, RequirementDraft } from '../../app/state/types'
import type { ParsedQuery } from '../../domain/types'
import { AppStateContext, useAppState } from '../../app/state/useAppState'
import { RequirementForm } from './RequirementForm'

const TODAY = '2026-11-15'

function renderForm(req: Partial<RequirementDraft> = {}) {
  const base = initState('', null, TODAY)
  const state: AppState = { ...base, req: { ...base.req, ...req } }
  const dispatch = vi.fn<(a: Action) => void>()
  render(
    <AppStateContext.Provider value={{ state, dispatch }}>
      <RequirementForm />
    </AppStateContext.Provider>,
  )
  return dispatch
}

const lastPatch = (dispatch: ReturnType<typeof renderForm>) => {
  const last = dispatch.mock.calls.at(-1)?.[0]
  return last?.type === 'req/set' ? last.patch : undefined
}

describe('RequirementForm', () => {
  it('has a text size field with the e.g. placeholder', () => {
    renderForm()
    const min = screen.getByTestId('req-min-sf')
    expect(min).toHaveAttribute('type', 'text')
    expect(min).toHaveAttribute('placeholder', 'e.g. 10,000')
    expect(screen.getByLabelText(/minimum size/i)).toBe(min)
  })

  it.each(['10000', '10,000', '10k', '10K'])('"%s" sets minSf 10000', async (text) => {
    const dispatch = renderForm()
    await userEvent.type(screen.getByTestId('req-min-sf'), text)
    expect(lastPatch(dispatch)).toEqual({ minSf: 10_000, maxSf: null, maxRentPsf: null })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it.each([['16.1k', 16_100], ['1.001k', 1_001], ['10.5k', 10_500], ['32.3k', 32_300], ['1,000,000', 1_000_000]])(
    '"%s" sets minSf %i', async (text, value) => {
      const dispatch = renderForm()
      await userEvent.click(screen.getByTestId('req-min-sf'))
      await userEvent.paste(text)
      expect(lastPatch(dispatch)).toEqual({ minSf: value, maxSf: null, maxRentPsf: null })
    },
  )

  it.each(['10.0005k', '1,234,567', '10,5k', '1,0,0,0', ',100', '100,', '10,00', '0', '1.5'])(
    'size "%s" is rejected with the size error and nothing is dispatched', async (text) => {
      const dispatch = renderForm()
      await userEvent.click(screen.getByTestId('req-min-sf'))
      await userEvent.paste(text)
      expect(screen.getByRole('status')).toHaveTextContent(/1 and 1,000,000/)
      expect(dispatch).not.toHaveBeenCalled()
    },
  )

  it('the max-size field follows the same comma rule', async () => {
    const dispatch = renderForm({ minSf: 1_000 })
    await userEvent.click(screen.getByTestId('req-max-sf'))
    await userEvent.paste('1,0,0,0')
    expect(screen.getByRole('status')).toHaveTextContent(/1 and 1,000,000/)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('inputs use the text keypad, and errors are polite status messages, not alerts', async () => {
    renderForm()
    for (const id of ['req-min-sf', 'req-max-sf', 'req-max-rent']) expect(screen.getByTestId(id)).toHaveAttribute('inputmode', 'text')
    await userEvent.type(screen.getByTestId('req-min-sf'), 'x')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })

  it('rejects a size that is not a whole number in range, and dispatches nothing', async () => {
    const dispatch = renderForm()
    await userEvent.type(screen.getByTestId('req-min-sf'), 'abc')
    expect(screen.getByRole('status')).toHaveTextContent(/1 and 1,000,000/)
    expect(screen.getByTestId('req-min-sf')).toHaveAttribute('aria-invalid', 'true')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('max below min shows an error and dispatches nothing', async () => {
    const dispatch = renderForm({ minSf: 10_000 })
    expect(screen.getByTestId('req-min-sf')).toHaveValue('10,000')
    await userEvent.type(screen.getByTestId('req-max-sf'), '9000')
    expect(screen.getByRole('status')).toHaveTextContent(/at least the minimum/i)
    expect(screen.getByTestId('req-max-sf')).toHaveAttribute('aria-invalid', 'true')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('max at or above min is dispatched', async () => {
    const dispatch = renderForm({ minSf: 10_000 })
    await userEvent.type(screen.getByTestId('req-max-sf'), '10,300')
    expect(lastPatch(dispatch)).toEqual({ minSf: 10_000, maxSf: 10_300, maxRentPsf: null })
  })

  it.each(['0', '1001', 'x'])('rent "%s" is out of 1..1000: error, nothing dispatched', async (text) => {
    const dispatch = renderForm({ minSf: 10_000 })
    await userEvent.click(screen.getByTestId('req-max-rent'))
    await userEvent.paste(text) // typing "1001" would pass through the valid "1", "10", "100"
    expect(screen.getByRole('status')).toHaveTextContent(/\$1 and \$1,000/)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it.each([['1', 1], ['1000', 1000], ['$52.5', 52.5]])('rent "%s" is accepted', async (text, value) => {
    const dispatch = renderForm({ minSf: 10_000 })
    await userEvent.type(screen.getByTestId('req-max-rent'), text)
    expect(lastPatch(dispatch)).toEqual({ minSf: 10_000, maxSf: null, maxRentPsf: value })
  })

  it('the potential toggle dispatches includePotential', async () => {
    const dispatch = renderForm()
    const box = screen.getByTestId('req-include-potential')
    expect(box).toBeChecked()
    await userEvent.click(box)
    expect(dispatch).toHaveBeenCalledWith({ type: 'req/set', patch: { includePotential: false } })
  })

  it('Clear empties the form and dispatches req/clear', async () => {
    const dispatch = renderForm({ minSf: 10_000, maxSf: 12_000, maxRentPsf: 60 })
    await userEvent.type(screen.getByTestId('req-max-sf'), '5')
    await userEvent.click(screen.getByTestId('req-clear'))
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'req/clear' })
    expect(screen.getByTestId('req-min-sf')).toHaveValue('')
    expect(screen.getByTestId('req-max-sf')).toHaveValue('')
    expect(screen.getByTestId('req-max-rent')).toHaveValue('')
    expect(screen.queryByRole('status')).toBeNull()
  })
})

function ApplyButton() {
  const { dispatch } = useAppState()
  return (
    <button type="button" onClick={() => dispatch({ type: 'ask/apply', parsed: { minSf: 9_000, maxSf: 11_000, maxRentPsf: 60 } })}>
      apply
    </button>
  )
}

describe('RequirementForm with the real reducer', () => {
  it('keeps the typed text, and shows a requirement set from outside the form', async () => {
    render(
      <StateProvider initialState={initState('', null, TODAY)}>
        <RequirementForm />
        <ApplyButton />
      </StateProvider>,
    )
    await userEvent.type(screen.getByTestId('req-min-sf'), '10k')
    expect(screen.getByTestId('req-min-sf')).toHaveValue('10k')
    await userEvent.click(screen.getByRole('button', { name: 'apply' }))
    expect(screen.getByTestId('req-min-sf')).toHaveValue('9,000')
    expect(screen.getByTestId('req-max-sf')).toHaveValue('11,000')
    expect(screen.getByTestId('req-max-rent')).toHaveValue('60')
  })
})

function AskApply({ parsed }: { parsed: ParsedQuery }) {
  const { dispatch } = useAppState()
  return <button type="button" onClick={() => dispatch({ type: 'ask/apply', parsed })}>ask</button>
}

describe('RequirementForm: invalid drafts after a requirement set from outside', () => {
  function renderReal(req: Partial<RequirementDraft> = {}, parsed: ParsedQuery = { minSf: 10_000 }) {
    const base = initState('', null, TODAY)
    render(
      <StateProvider initialState={{ ...base, req: { ...base.req, ...req } }}>
        <RequirementForm />
        <AskApply parsed={parsed} />
      </StateProvider>,
    )
  }

  async function typeInvalidMaxAndRent() {
    await userEvent.type(screen.getByTestId('req-max-sf'), 'huge')
    await userEvent.type(screen.getByTestId('req-max-rent'), 'cheap')
    expect(screen.getByTestId('req-max-sf')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('req-max-rent')).toHaveAttribute('aria-invalid', 'true')
  }

  it('ask/apply {minSf: 10000} replaces "huge" in max and "cheap" in rent with empty fields and no error', async () => {
    renderReal()
    await typeInvalidMaxAndRent()
    await userEvent.click(screen.getByRole('button', { name: 'ask' }))
    expect(screen.getByTestId('req-min-sf')).toHaveValue('10,000')
    expect(screen.getByTestId('req-max-sf')).toHaveValue('')
    expect(screen.getByTestId('req-max-rent')).toHaveValue('')
    expect(screen.getByTestId('req-max-sf')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByTestId('req-max-rent')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('also when the asked size equals the size already in state', async () => {
    renderReal({ minSf: 10_000 })
    await typeInvalidMaxAndRent()
    await userEvent.click(screen.getByRole('button', { name: 'ask' }))
    expect(screen.getByTestId('req-max-sf')).toHaveValue('')
    expect(screen.getByTestId('req-max-rent')).toHaveValue('')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('typing a valid value in another field keeps the invalid text (nothing is dispatched)', async () => {
    renderReal()
    await typeInvalidMaxAndRent()
    await userEvent.type(screen.getByTestId('req-min-sf'), '10k')
    expect(screen.getByTestId('req-max-sf')).toHaveValue('huge')
    expect(screen.getByTestId('req-max-rent')).toHaveValue('cheap')
  })

  it('the potential toggle keeps the invalid text the broker is still fixing', async () => {
    renderReal({ minSf: 10_000 })
    await typeInvalidMaxAndRent()
    await userEvent.click(screen.getByTestId('req-include-potential'))
    expect(screen.getByTestId('req-include-potential')).not.toBeChecked()
    expect(screen.getByTestId('req-max-sf')).toHaveValue('huge')
    expect(screen.getByTestId('req-max-rent')).toHaveValue('cheap')
  })
})
