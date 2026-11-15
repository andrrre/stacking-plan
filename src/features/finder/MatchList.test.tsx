import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initState } from '../../app/state/init'
import type { Action, AppState, RequirementDraft } from '../../app/state/types'
import { AppStateContext } from '../../app/state/useAppState'
import { MatchList } from './MatchList'

const TODAY = '2026-11-15'

function renderList(req: Partial<RequirementDraft>, over: Partial<AppState> = {}) {
  const base = initState('', null, TODAY)
  const state: AppState = { ...base, ...over, req: { ...base.req, ...req } }
  const dispatch = vi.fn<(a: Action) => void>()
  render(
    <AppStateContext.Provider value={{ state, dispatch }}>
      <MatchList />
    </AppStateContext.Provider>,
  )
  return dispatch
}

describe('MatchList', () => {
  it('min 10,000 today: #1 Suite 500, #2 Suites 700 + 710, with the scannable facts', () => {
    renderList({ minSf: 10_000 })
    const list = screen.getByTestId('match-list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)

    const first = screen.getByTestId('match-1')
    expect(first).toHaveAttribute('data-key', 'odt-500')
    expect(first).toHaveTextContent('Suite 500')
    expect(first).toHaveTextContent('Floor 5')
    expect(first).toHaveTextContent('10,250 SF')
    expect(first).toHaveTextContent('+250 SF')
    expect(first).toHaveTextContent('$48.00')
    expect(first).toHaveTextContent(/available now/i)

    const second = screen.getByTestId('match-2')
    expect(second).toHaveAttribute('data-key', 'odt-700+odt-710')
    expect(second).toHaveTextContent('Suites 700 + 710')
    expect(second).toHaveTextContent('Floor 7')
    expect(second).toHaveTextContent('10,500 SF')
    expect(second).toHaveTextContent('+500 SF')
    expect(second).toHaveTextContent('$52.18')
    expect(second).toHaveTextContent(/combined/i)
    expect(within(first).getByRole('button')).toHaveAccessibleName(/^Match 1: Suite 500/)
  })

  it('at 2027-07-01: firm 400+410 shows "from Jun 2027", 600 is marked potential', () => {
    renderList({ minSf: 10_000 }, { asOf: '2027-07-01' })
    const keys = ['match-1', 'match-2', 'match-3', 'match-4'].map((id) => screen.getByTestId(id).getAttribute('data-key'))
    expect(keys).toEqual(['odt-400+odt-410', 'odt-500', 'odt-700+odt-710', 'odt-600'])
    expect(screen.getByTestId('match-1')).toHaveTextContent(/from Jun 2027/i)
    expect(screen.getByTestId('match-1')).not.toHaveTextContent(/potential/i)
    expect(screen.getByTestId('match-2')).toHaveTextContent(/available now/i)
    expect(screen.getByTestId('match-4')).toHaveTextContent(/potential/i)
    expect(screen.getByTestId('match-4')).toHaveTextContent(/from May 2027/i)
  })

  it('clicking a card selects that match', async () => {
    const dispatch = renderList({ minSf: 10_000 })
    await userEvent.click(within(screen.getByTestId('match-2')).getByRole('button'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: { kind: 'match', key: 'odt-700+odt-710' } })
  })

  it('no fits → a plain "No matches" line', () => {
    renderList({ minSf: 60_000 })
    expect(screen.getByTestId('match-list')).toHaveTextContent('No matches')
    expect(screen.queryByTestId('match-1')).toBeNull()
  })
})
