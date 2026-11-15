import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { BUNDLED_BUILDINGS } from '../../data'
import type { Candidate } from '../../domain/types'
import { FloorRow } from './FloorRow'
import { buildStackModel } from './suiteVisual'
import { useRovingFocus } from './useRovingFocus'

const TODAY = '2026-11-15'

function candidate(numbers: string[], floor: number): Candidate {
  return {
    key: numbers.map((n) => `odt-${n}`).join('+'), suiteIds: numbers.map((n) => `odt-${n}`), suiteNumbers: numbers, floor,
    totalSf: 0, excessSf: 0, blendedRentPsf: 0, availableFrom: TODAY, availability: 'now', caveats: [],
  }
}

function Harness({ floor, matches, testId }: { floor: number; matches: Candidate[]; testId?: string }) {
  const model = buildStackModel({
    building: BUNDLED_BUILDINGS[0], asOf: TODAY, today: TODAY, mode: 'availability', matches,
    highlightIds: null, modifiedIds: new Set(), selectedSuiteId: null,
  })
  const f = model.floors.find((x) => x.number === floor)
  const grid = model.floors.map((x) => x.suites.map((v) => v.suite.id))
  const { getItemProps } = useRovingFocus(grid, { selectedId: null, onSelect: () => {} })
  return f ? <FloorRow floor={f} getItemProps={getItemProps} onSelect={() => {}} testId={testId} /> : null
}

const idsIn = (el: HTMLElement) => within(el).getAllByRole('button').map((b) => b.getAttribute('data-testid'))

describe('FloorRow match outlines', () => {
  it('wraps a two-suite run in one outline, in DOM order, with its badge', () => {
    render(<Harness floor={7} matches={[candidate(['500'], 5), candidate(['700', '710'], 7)]} />)
    const outline = screen.getByTestId('match-outline-2')
    expect(idsIn(outline)).toEqual(['suite-odt-700', 'suite-odt-710'])
    expect(outline).toHaveTextContent(/^2/)
    expect(idsIn(screen.getByTestId('floor-7'))).toEqual(['suite-odt-700', 'suite-odt-710', 'suite-odt-720'])
    expect(screen.queryByTestId('match-outline-1')).toBeNull()
  })

  it('keeps the roving tabIndex unchanged by outlines', () => {
    render(<Harness floor={12} matches={[candidate(['1200'], 12)]} />)
    expect(screen.getByTestId('suite-odt-1200')).toHaveAttribute('tabIndex', '0')
    render(<Harness floor={7} matches={[candidate(['700', '710'], 7)]} />)
    expect(screen.getByTestId('suite-odt-700')).toHaveAttribute('tabIndex', '-1')
  })

  it('outlines a single-suite run', () => {
    render(<Harness floor={5} matches={[candidate(['500'], 5)]} />)
    expect(idsIn(screen.getByTestId('match-outline-1'))).toEqual(['suite-odt-500'])
    expect(screen.getByTestId('suite-odt-500')).toHaveAttribute('data-match-rank', '1')
  })

  it('trims a lower-ranked run that overlaps a better one instead of dropping it', () => {
    const matches = [candidate(['500'], 5), candidate(['700', '710'], 7), candidate(['310'], 3), candidate(['300', '310'], 3)]
    render(<Harness floor={3} matches={matches} />)
    expect(idsIn(screen.getByTestId('match-outline-3'))).toEqual(['suite-odt-310'])
    expect(idsIn(screen.getByTestId('match-outline-4'))).toEqual(['suite-odt-300'])
    expect(screen.getByTestId('suite-odt-300')).toHaveAttribute('data-match-rank', '4')
    expect(screen.getByTestId('suite-odt-310')).toHaveAttribute('data-match-rank', '3')
  })

  it('accepts a floor test-id override', () => {
    render(<Harness floor={5} matches={[]} testId="mini-floor-5" />)
    expect(screen.getByTestId('mini-floor-5')).toBeInTheDocument()
    expect(screen.queryByTestId('floor-5')).toBeNull()
  })
})
