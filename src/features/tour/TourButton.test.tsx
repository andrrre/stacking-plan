import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initState } from '../../app/state/init'
import type { Action, AppState } from '../../app/state/types'
import { AppStateContext } from '../../app/state/useAppState'
import { BUNDLED_BUILDINGS } from '../../data'
import { building, floor, lease, suite } from '../../domain/testing/fixtures'
import { DetailsActions } from '../details/DetailsActions'
import { NO_STOPS_HINT, TourButton } from './TourButton'

const TODAY = '2026-11-15'
const hero = BUNDLED_BUILDINGS[0]

function renderWith(ui: React.ReactNode, over: Partial<AppState> = {}) {
  const state: AppState = { ...initState('', null, TODAY), ...over }
  const dispatch = vi.fn<(a: Action) => void>()
  render(<AppStateContext.Provider value={{ state, dispatch }}>{ui}</AppStateContext.Provider>)
  return dispatch
}

describe('TourButton', () => {
  it('is there only while presenting', () => {
    renderWith(<TourButton />)
    expect(screen.queryByTestId('tour')).toBeNull()
  })

  it('starts a tour of the available suites, top floor first', async () => {
    const dispatch = renderWith(<TourButton />, { presenting: true })
    await userEvent.click(screen.getByTestId('tour'))
    const start = dispatch.mock.calls[0]?.[0]
    expect(start).toMatchObject({ type: 'tour/start', index: 0 })
    expect(start?.type === 'tour/start' && start.stops[0]?.key).toBe('odt-700')
  })

  it('with nothing to tour it is aria-disabled and says why', async () => {
    const full = building({ id: 'full', floors: [floor({ suites: [suite({ leases: [lease({ start: '2024-01-01', end: '2034-12-31' })] })] })] })
    const dispatch = renderWith(<TourButton />, { presenting: true, importedBuildings: [full], buildingId: 'full' })
    const button = screen.getByTestId('tour')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent(NO_STOPS_HINT)
    await userEvent.click(button)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('during a tour it ends it', async () => {
    const dispatch = renderWith(<TourButton />, { presenting: true, tour: { stops: [], index: 0, phase: 'look', playing: false } })
    expect(screen.getByTestId('tour')).toHaveTextContent('End tour')
    await userEvent.click(screen.getByTestId('tour'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'tour/exit' })
  })
})

describe('Tour suite (details)', () => {
  const at = (n: string) => {
    const f = hero.floors.find((x) => x.suites.some((s) => s.number === n))!
    return { floor: f, suite: f.suites.find((s) => s.number === n)! }
  }

  it('an available suite offers it, and starts the tour at its own stop', async () => {
    const dispatch = renderWith(<DetailsActions {...at('410')} />)
    await userEvent.click(screen.getByTestId('tour-suite'))
    const start = dispatch.mock.calls[0]?.[0]
    expect(start?.type).toBe('tour/start')
    if (start?.type === 'tour/start') expect(start.stops[start.index]?.suiteIds).toEqual(['odt-410'])
  })

  it('an occupied suite does not', () => {
    renderWith(<DetailsActions {...at('900')} />)
    expect(screen.queryByTestId('tour-suite')).toBeNull()
  })
})
