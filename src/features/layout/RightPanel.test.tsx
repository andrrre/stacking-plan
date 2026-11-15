import { useEffect, useMemo, type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import type { Action, AppState, RequirementDraft, Selection } from '../../app/state/types'
import { AppStateContext, useAppState } from '../../app/state/useAppState'
import { RequirementForm } from '../finder/RequirementForm'
import { RightPanel } from './RightPanel'

const TODAY = '2026-11-15'

function renderPanel(selection: Selection, req: Partial<RequirementDraft>, over: Partial<AppState> = {}) {
  const base = initState('', null, TODAY)
  const state: AppState = { ...base, ...over, selection, req: { ...base.req, ...req } }
  const dispatch = vi.fn<(a: Action) => void>()
  render(
    <AppStateContext.Provider value={{ state, dispatch }}>
      <RightPanel />
    </AppStateContext.Provider>,
  )
  return dispatch
}

const CLEAR: Action = { type: 'select', selection: null }

describe('RightPanel match selection (A11)', () => {
  it('a selected current match shows MatchWhy and keeps the selection', () => {
    const dispatch = renderPanel({ kind: 'match', key: 'odt-700+odt-710' }, { minSf: 10_000 })
    expect(screen.getByTestId('match-why')).toHaveTextContent('Suites 700 + 710')
    expect(screen.queryByTestId('match-list')).toBeNull()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('a stale key (no current candidate) dispatches select(null) and falls through to the list', () => {
    const dispatch = renderPanel({ kind: 'match', key: 'odt-400+odt-410' }, { minSf: 10_000 })
    expect(dispatch).toHaveBeenCalledWith(CLEAR)
    expect(screen.queryByTestId('match-why')).toBeNull()
    expect(screen.getByTestId('match-list')).toBeVisible()
  })

  it('a match selection with no requirement (after Clear) dispatches select(null) and shows the empty state', () => {
    const dispatch = renderPanel({ kind: 'match', key: 'odt-500' }, { minSf: null })
    expect(dispatch).toHaveBeenCalledWith(CLEAR)
    expect(screen.getByTestId('right-empty')).toBeVisible()
  })

  it('a match that still exists after a date move stays selected', () => {
    const dispatch = renderPanel({ kind: 'match', key: 'odt-500' }, { minSf: 10_000 }, { asOf: '2027-07-01' })
    expect(screen.getByTestId('match-why')).toHaveTextContent('Suite 500')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('a suite selection is never cleared by the match effect', () => {
    const dispatch = renderPanel({ kind: 'suite', suiteId: 'odt-600' }, { minSf: 10_000 })
    expect(screen.getByTestId('suite-details')).toBeVisible()
    expect(dispatch).not.toHaveBeenCalled()
  })
})

// Real reducer through StateProvider. SpyDispatch re-provides the same state with a dispatch that records every
// action the panel sends, so the stale-selection effect can be shown to fire once and then settle.
function SpyDispatch({ spy, children }: { spy: (a: Action) => void; children: ReactNode }) {
  const { state, dispatch } = useAppState()
  const spied = useMemo(() => (a: Action) => { spy(a); dispatch(a) }, [spy, dispatch])
  return <AppStateContext.Provider value={{ state, dispatch: spied }}>{children}</AppStateContext.Provider>
}

/** Hands the real dispatch to the test, so it can send actions the way other parts of the app do. */
function Driver({ expose }: { expose: (d: (a: Action) => void) => void }) {
  const { dispatch } = useAppState()
  useEffect(() => expose(dispatch), [expose, dispatch])
  return null
}

function renderLive(over: Partial<AppState>, req: Partial<RequirementDraft>, withForm = false) {
  const base = initState('', null, TODAY)
  const state: AppState = { ...base, ...over, req: { ...base.req, ...req } }
  const spy = vi.fn<(a: Action) => void>()
  let send: (a: Action) => void = () => {}
  const expose = (d: (a: Action) => void) => { send = d }
  render(
    <StateProvider initialState={state}>
      <Driver expose={expose} />
      {withForm && <RequirementForm />}
      <SpyDispatch spy={spy}><RightPanel /></SpyDispatch>
    </StateProvider>,
  )
  return { spy, send: (a: Action) => act(() => send(a)) }
}

const clears = (spy: { mock: { calls: Action[][] } }) =>
  spy.mock.calls.filter(([a]) => a?.type === 'select' && a.selection === null).length

async function expectSettled(spy: { mock: { calls: Action[][] } }) {
  expect(clears(spy)).toBe(1)
  await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  expect(clears(spy)).toBe(1)
}

describe('RightPanel with the real reducer', () => {
  it('match 2 selected at min 10,000, then req/clear: back to right-empty, one select(null), settled', async () => {
    const { spy, send } = renderLive({ selection: { kind: 'match', key: 'odt-700+odt-710' } }, { minSf: 10_000 })
    expect(screen.getByTestId('match-why')).toBeVisible()
    send({ type: 'req/clear' })
    expect(screen.getByTestId('right-empty')).toBeVisible()
    await expectSettled(spy)
  })

  it('a date move that removes the selected candidate returns to the list, one select(null), settled', async () => {
    // 700+710 is in the min-10,000 results at every slider step, so match 1 at Jul 2027 (400+410) is used:
    // moving back to today, 400 is still leased and the candidate is gone.
    const { spy, send } = renderLive(
      { asOf: '2027-07-01', selection: { kind: 'match', key: 'odt-400+odt-410' } }, { minSf: 10_000 })
    expect(screen.getByTestId('match-why')).toHaveTextContent('Suites 400 + 410')
    send({ type: 'asOf/set', asOf: TODAY })
    expect(screen.getByTestId('match-list')).toBeVisible()
    expect(screen.queryByTestId('match-why')).toBeNull()
    await expectSettled(spy)
  })
})

describe('RightPanel focus after a panel swap', () => {
  const firstCard = () => within(screen.getByTestId('match-1')).getByRole('button', { name: /^Match 1:/ })

  it('clicking a match card focuses the MatchWhy heading', async () => {
    renderLive({}, { minSf: 10_000 })
    await userEvent.click(within(screen.getByTestId('match-2')).getByRole('button', { name: /^Match 2:/ }))
    expect(screen.getByRole('heading', { name: 'Suites 700 + 710' })).toHaveFocus()
  })

  it('"All matches" focuses the first match card', async () => {
    renderLive({ selection: { kind: 'match', key: 'odt-700+odt-710' } }, { minSf: 10_000 })
    await userEvent.click(screen.getByRole('button', { name: /all matches/i }))
    expect(firstCard()).toHaveFocus()
  })

  it('Jump to date focuses the first match card', async () => {
    renderLive({}, { minSf: 12_000 })
    await userEvent.click(screen.getByTestId('jump-to-date'))
    expect(screen.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-600')
    expect(firstCard()).toHaveFocus()
  })

  it('typing in the requirement form never moves focus, even when it clears a shown match', async () => {
    renderLive({ selection: { kind: 'match', key: 'odt-700+odt-710' } }, { minSf: 10_000 }, true)
    const min = screen.getByTestId('req-min-sf')
    await userEvent.clear(min)
    await userEvent.type(min, '12000')
    expect(screen.getByTestId('no-fit')).toBeVisible()
    expect(min).toHaveFocus()
    await userEvent.clear(min)
    await userEvent.type(min, '10000')
    expect(screen.getByTestId('match-1')).toBeVisible()
    expect(min).toHaveFocus()
  })

  it('a date move that clears the selection leaves focus where it was', () => {
    const { send } = renderLive(
      { asOf: '2027-07-01', selection: { kind: 'match', key: 'odt-400+odt-410' } }, { minSf: 10_000 }, true)
    const min = screen.getByTestId('req-min-sf')
    act(() => min.focus())
    send({ type: 'asOf/set', asOf: TODAY })
    expect(screen.getByTestId('match-list')).toBeVisible()
    expect(min).toHaveFocus()
  })
})
