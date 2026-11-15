import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initState } from '../../app/state/init'
import type { Action, AppState } from '../../app/state/types'
import { AppStateContext } from '../../app/state/useAppState'
import type { Change } from '../../domain/types'
import { ScenarioBar } from './ScenarioBar'

const TODAY = '2026-11-15'
const place: Change = { kind: 'newLease', suiteIds: ['odt-500'], tenant: 'Prospect', start: TODAY, end: '2031-11-14', rentPsf: 48 }
const renew: Change = { kind: 'renew', leaseId: 'odt-600-l1', newEnd: '2032-04-30' }

function renderBar(over: Partial<AppState> = {}) {
  const state: AppState = { ...initState('', null, TODAY), ...over }
  const dispatch = vi.fn<(a: Action) => void>()
  render(
    <AppStateContext.Provider value={{ state, dispatch }}>
      <ScenarioBar />
    </AppStateContext.Provider>,
  )
  return dispatch
}

describe('ScenarioBar', () => {
  it('is absent with no changes', () => {
    renderBar()
    expect(screen.queryByTestId('scenario-bar')).toBeNull()
  })

  it('placing a tenant on 500 at today: 72% → 79%, vacant down 10,250 SF, rent roll +$492,000', () => {
    renderBar({ changes: [place] })
    expect(screen.getByTestId('scenario-count')).toHaveTextContent('1 change')
    expect(screen.getByTestId('scenario-occupancy')).toHaveTextContent('72% → 79%')
    expect(screen.getByTestId('scenario-vacant')).toHaveTextContent('38,150 SF → 27,900 SF')
    expect(screen.getByTestId('scenario-rent-roll')).toHaveTextContent('$4,913,650 → $5,405,650')
    expect(screen.getByTestId('scenario-rent-roll')).toHaveTextContent('+$492,000')
  })

  it('counts changes and compares at the as-of date', () => {
    // Jul 2027: 600 renewed (+12,400 SF leased at $48) and 500 placed (+10,250 SF at $48).
    renderBar({ changes: [place, renew], asOf: '2027-07-01' })
    expect(screen.getByTestId('scenario-count')).toHaveTextContent('2 changes')
    expect(screen.getByTestId('scenario-occupancy')).toHaveTextContent('60% → 77%')
    expect(screen.getByTestId('scenario-vacant')).toHaveTextContent('53,650 SF → 31,000 SF')
    expect(screen.getByTestId('scenario-rent-roll')).toHaveTextContent('+$1,087,200')
  })

  it('a renewal that changes nothing at D shows a zero delta', () => {
    renderBar({ changes: [renew] })
    expect(screen.getByTestId('scenario-occupancy')).toHaveTextContent('72% → 72%')
    expect(screen.getByTestId('scenario-rent-roll')).toHaveTextContent('±$0')
  })

  it('Reset dispatches scenario/reset', async () => {
    const dispatch = renderBar({ changes: [place] })
    await userEvent.click(screen.getByTestId('scenario-reset'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'scenario/reset' })
  })
})
