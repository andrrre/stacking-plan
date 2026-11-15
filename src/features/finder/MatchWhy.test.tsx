import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initState } from '../../app/state/init'
import type { Action, AppState } from '../../app/state/types'
import { AppStateContext } from '../../app/state/useAppState'
import { BUNDLED_BUILDINGS } from '../../data'
import { findFits } from '../../domain/findFits'
import type { Candidate } from '../../domain/types'
import { MatchWhy } from './MatchWhy'

const TODAY = '2026-11-15'
const hero = BUNDLED_BUILDINGS[0]

function fit(key: string, asOf: string): Candidate {
  const c = findFits(hero, { minSf: 10_000, includePotential: true }, asOf, TODAY).find((x) => x.key === key)
  if (!c) throw new Error(`no candidate ${key} at ${asOf}`)
  return c
}

function renderWhy(candidate: Candidate, rank: number, over: Partial<AppState> = {}) {
  const base = initState('', null, TODAY)
  const state: AppState = { ...base, ...over, req: { ...base.req, minSf: 10_000 }, selection: { kind: 'match', key: candidate.key } }
  const dispatch = vi.fn<(a: Action) => void>()
  render(
    <AppStateContext.Provider value={{ state, dispatch }}>
      <MatchWhy candidate={candidate} rank={rank} />
    </AppStateContext.Provider>,
  )
  return dispatch
}

describe('MatchWhy', () => {
  it('700+710 today: suites, 10,500 SF, +500 SF, $52.18, free now, the combine caveat', () => {
    renderWhy(fit('odt-700+odt-710', TODAY), 2)
    const panel = screen.getByTestId('match-why')
    expect(panel).toHaveTextContent('Suites 700 + 710')
    expect(panel).toHaveTextContent('Floor 7')
    expect(panel).toHaveTextContent('10,500 SF')
    expect(panel).toHaveTextContent('+500 SF')
    expect(panel).toHaveTextContent('$52.18')
    expect(panel).toHaveTextContent(/Available\s*Now/)
    expect(screen.getAllByTestId('match-why-caveat').map((el) => el.textContent)).toEqual(['Requires combining 2 suites.'])
  })

  it('600 at Jul 2027: potential, free from 1 May 2027, the broker no-renewal caveat', () => {
    renderWhy(fit('odt-600', '2027-07-01'), 4, { asOf: '2027-07-01' })
    const panel = screen.getByTestId('match-why')
    expect(panel).toHaveTextContent('Suite 600')
    expect(panel).toHaveTextContent('1 May 2027')
    expect(panel).toHaveTextContent(/potential/i)
    expect(screen.getAllByTestId('match-why-caveat').map((el) => el.textContent))
      .toEqual(['Assumes Flamingo Row Media does not renew (lease ends 30 Apr 2027).'])
  })

  it('a single firm suite has no caveats', () => {
    renderWhy(fit('odt-500', TODAY), 1)
    expect(screen.queryByTestId('match-why-caveat')).toBeNull()
    expect(screen.getByTestId('match-why')).toHaveTextContent(/no caveats/i)
  })

  it('the back button returns to the list by clearing the selection', async () => {
    const dispatch = renderWhy(fit('odt-500', TODAY), 1)
    await userEvent.click(within(screen.getByTestId('match-why')).getByRole('button', { name: /all matches/i }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: null })
  })
})
