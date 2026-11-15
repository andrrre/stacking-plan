import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initState } from '../../app/state/init'
import type { Action } from '../../app/state/types'
import { AppStateContext } from '../../app/state/useAppState'
import { BUNDLED_BUILDINGS } from '../../data'
import { explainNoFit } from '../../domain/explainNoFit'
import type { Candidate, NoFit as NoFitResult } from '../../domain/types'
import { NoFit } from './NoFit'

const TODAY = '2026-11-15'
const hero = BUNDLED_BUILDINGS[0]

function renderNoFit(noFit: NoFitResult) {
  const dispatch = vi.fn<(a: Action) => void>()
  render(
    <AppStateContext.Provider value={{ state: initState('', null, TODAY), dispatch }}>
      <NoFit noFit={noFit} />
    </AppStateContext.Provider>,
  )
  return dispatch
}

const reasonTexts = () => screen.getAllByTestId('no-fit-reason').map((el) => el.textContent)

const firm: Candidate = {
  key: 'odt-700+odt-710', suiteIds: ['odt-700', 'odt-710'], suiteNumbers: ['700', '710'], floor: 7, totalSf: 10_500,
  excessSf: 500, blendedRentPsf: 52.18, availableFrom: '2027-02-01', availability: 'now', caveats: [],
}

describe('NoFit', () => {
  it('min 12,000 today: the §5.4 copy, one element per reason', () => {
    renderNoFit(explainNoFit(hero, { minSf: 12_000, includePotential: true }, TODAY, TODAY))
    expect(reasonTexts()).toEqual([
      'Largest block is 10,500 SF on floor 7.',
      '35,150 SF is available, but split into 5 blocks on 4 floors.',
    ])
    expect(screen.getByTestId('no-fit')).toHaveTextContent('Earliest fit: May 2027 — Suite 600 (potential).')
  })

  it('Jump to date dispatches noFit/jump with the earliest-fit date', async () => {
    const dispatch = renderNoFit(explainNoFit(hero, { minSf: 12_000, includePotential: true }, TODAY, TODAY))
    await userEvent.click(screen.getByTestId('jump-to-date'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'noFit/jump', asOf: '2027-05-01' })
  })

  it('a firm fit omits "(potential)" and names every suite', () => {
    renderNoFit({ reasons: [{ kind: 'nothingAvailable' }], earliestFit: { date: '2027-02-01', candidate: firm } })
    expect(screen.getByTestId('no-fit')).toHaveTextContent('Earliest fit: Feb 2027 — Suites 700 + 710.')
    expect(screen.getByTestId('no-fit')).not.toHaveTextContent('potential')
  })

  it('no fit in the horizon: says so and offers no jump', () => {
    renderNoFit(explainNoFit(hero, { minSf: 60_000, includePotential: true }, TODAY, TODAY))
    expect(screen.getByTestId('no-fit')).toHaveTextContent('No fit in the next 5 years.')
    expect(screen.queryByTestId('jump-to-date')).toBeNull()
  })

  it('nothing available and filtered reasons', () => {
    renderNoFit({ reasons: [{ kind: 'nothingAvailable' }], earliestFit: null })
    expect(reasonTexts()).toEqual(['No space is available on this date.'])
  })

  it.each([
    [['maxSf'] as const, 'Space this size exists above your maximum size.'],
    [['maxRentPsf'] as const, 'Space this size exists above your maximum rent.'],
    [['maxSf', 'maxRentPsf'] as const, 'Space this size exists above your maximum size / rent.'],
  ])('filtered by %j', (by, text) => {
    renderNoFit({ reasons: [{ kind: 'filtered', by: [...by] }], earliestFit: null })
    expect(reasonTexts()).toEqual([text])
  })

  it('spread on one floor reads in the singular', () => {
    renderNoFit({ reasons: [{ kind: 'spread', totalSf: 2000, floorCount: 1, blockCount: 2 }], earliestFit: null })
    expect(reasonTexts()).toEqual(['2,000 SF is available, but split into 2 blocks on 1 floor.'])
  })
})
