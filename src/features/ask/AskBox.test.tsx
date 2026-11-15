import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initState } from '../../app/state/init'
import { StateProvider } from '../../app/state/StateProvider'
import type { Action, AppState } from '../../app/state/types'
import { AppStateContext } from '../../app/state/useAppState'
import { RequirementForm } from '../finder/RequirementForm'
import { AskBox } from './AskBox'
import { building } from '../../domain/testing/fixtures'

const TODAY = '2026-11-15'
const LAW_FIRM = 'Law firm, roughly 9–11k SF, moving in by Q2 next year, under $60'

function renderBox(overrides: Partial<AppState> = {}) {
  const state: AppState = { ...initState('', null, TODAY), ...overrides }
  const dispatch = vi.fn<(a: Action) => void>()
  render(
    <AppStateContext.Provider value={{ state, dispatch }}>
      <AskBox />
    </AppStateContext.Provider>,
  )
  return dispatch
}

/** /api/ask is unreachable, as in the demo and every test run. */
const offline = () => vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'x' }, { status: 503 })))

describe('AskBox', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('has a labelled text input and an Ask button', () => {
    offline()
    renderBox()
    expect(screen.getByTestId('ask-input')).toHaveAccessibleName(/describe the requirement/i)
    expect(screen.getByTestId('ask-input')).toHaveAttribute('maxlength', '500')
    expect(screen.getByTestId('ask-submit')).toHaveTextContent('Ask')
  })

  it('Enter submits; offline parsing dispatches ask/apply and says so', async () => {
    offline()
    const dispatch = renderBox()
    await userEvent.type(screen.getByTestId('ask-input'), `${LAW_FIRM}{Enter}`)
    expect(await screen.findByTestId('ask-status')).toHaveTextContent('Offline parsing')
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ask/apply',
      parsed: { minSf: 9000, maxSf: 11000, maxRentPsf: 60, moveInBy: '2027-06-30' },
    })
    expect(screen.getByTestId('ask-understood')).toHaveTextContent('9,000–11,000 SF')
    expect(screen.getByTestId('ask-understood')).toHaveTextContent('$60.00')
    expect(screen.getByTestId('ask-understood')).toHaveTextContent('30 Jun 2027')
    expect(screen.queryByTestId('ask-warning')).not.toBeInTheDocument()
  })

  it('uses the AI fields when /api/ask answers, with no offline note', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ minSf: 9500 })))
    const dispatch = renderBox()
    await userEvent.type(screen.getByTestId('ask-input'), 'about 9.5k{Enter}')
    expect(await screen.findByTestId('ask-status')).not.toHaveTextContent('Offline parsing')
    expect(dispatch).toHaveBeenCalledWith({ type: 'ask/apply', parsed: { minSf: 9500 } })
  })

  it('says "Size not understood" when no size was found', async () => {
    offline()
    renderBox()
    await userEvent.type(screen.getByTestId('ask-input'), 'law firm by June{Enter}')
    expect(await screen.findByTestId('ask-warning')).toHaveTextContent('Size not understood')
  })

  it('notes a move-in date beyond the five-year horizon', async () => {
    offline()
    renderBox()
    await userEvent.type(screen.getByTestId('ask-input'), '10k SF by 2035{Enter}')
    expect(await screen.findByTestId('ask-warning')).toHaveTextContent(/beyond.*Nov 2031/i)
  })

  it('shows a busy state while waiting and ignores empty text', async () => {
    let answer: (r: Response) => void = () => undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { answer = resolve })))
    const dispatch = renderBox()
    expect(screen.getByTestId('ask-submit')).toBeDisabled()
    await userEvent.type(screen.getByTestId('ask-input'), '10k{Enter}')
    expect(screen.getByTestId('ask-submit')).toBeDisabled()
    expect(screen.getByTestId('ask-submit')).toHaveTextContent(/reading/i)
    answer(Response.json({ minSf: 10000 }))
    expect(await screen.findByTestId('ask-status')).toBeInTheDocument()
    expect(screen.getByTestId('ask-submit')).toBeEnabled()
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('does not overwrite a requirement the broker edited while the request was pending', async () => {
    let answer: (r: Response) => void = () => undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { answer = resolve })))
    render(
      <StateProvider initialState={initState('', null, TODAY)}>
        <AskBox />
        <RequirementForm />
      </StateProvider>,
    )
    await userEvent.type(screen.getByTestId('ask-input'), '9k SF{Enter}')
    await userEvent.type(screen.getByTestId('req-min-sf'), '12k')
    answer(Response.json({ minSf: 9000 }))
    expect(await screen.findByTestId('ask-warning')).toHaveTextContent(/form was edited/i)
    expect(screen.getByTestId('req-min-sf')).toHaveValue('12k')
    expect(screen.getByTestId('ask-submit')).toHaveTextContent('Ask')
  })

  it('for an imported building, parses offline and sends nothing to /api/ask', async () => {
    const fetchFn = vi.fn(async () => Response.json({ minSf: 1234 }))
    vi.stubGlobal('fetch', fetchFn)
    const own = building({ id: 'csv-own' })
    const dispatch = renderBox({ importedBuildings: [own], buildingId: 'csv-own' })
    await userEvent.type(screen.getByTestId('ask-input'), `${LAW_FIRM}{Enter}`)
    expect(await screen.findByTestId('ask-status')).toHaveTextContent('Offline parsing')
    expect(fetchFn).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'ask/apply', parsed: expect.objectContaining({ minSf: 9000 }) }))
  })

  it('for a bundled building, still asks /api/ask', async () => {
    const fetchFn = vi.fn(async () => Response.json({ minSf: 1234 }))
    vi.stubGlobal('fetch', fetchFn)
    renderBox()
    await userEvent.type(screen.getByTestId('ask-input'), `${LAW_FIRM}{Enter}`)
    expect(await screen.findByTestId('ask-status')).toHaveTextContent('Read by AI')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
