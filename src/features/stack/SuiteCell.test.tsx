import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { BUNDLED_BUILDINGS } from '../../data'
import { SuiteCell } from './SuiteCell'
import { suiteDataAttributes } from './suiteAttributes'
import { buildStackModel, type SuiteVisual } from './suiteVisual'
import type { RovingItemProps } from './useRovingFocus'

const TODAY = '2026-11-15'
const roving: RovingItemProps = { tabIndex: 0, ref: () => {}, onFocus: () => {}, onKeyDown: () => {} }

function visual(number: string, move: SuiteVisual['move'] = null): SuiteVisual {
  const model = buildStackModel({
    building: BUNDLED_BUILDINGS[0], asOf: TODAY, today: TODAY, mode: 'availability', matches: [],
    highlightIds: null, modifiedIds: new Set(), selectedSuiteId: null,
  })
  const v = model.floors.flatMap((f) => f.suites).find((x) => x.suite.number === number)
  if (!v) throw new Error(`suite ${number} not in model`)
  return { ...v, move }
}

describe('SuiteCell', () => {
  it('uses the suite- test id', () => {
    render(<SuiteCell visual={visual('500')} roving={roving} joinsNext={false} onSelect={() => {}} />)
    expect(screen.getByTestId('suite-odt-500')).toHaveAttribute('data-status', 'vacant')
  })

  it('carries exactly the shared data attributes', () => {
    const v = visual('1010')
    render(<SuiteCell visual={v} roving={roving} joinsNext onSelect={() => {}} />)
    const el = screen.getByTestId('suite-odt-1010')
    const attrs = suiteDataAttributes(v, true)
    expect(attrs).toMatchObject({ 'data-status': 'vacant', 'data-overlay': 'committed', 'data-joins-next': 'true', 'data-filtered': 'false' })
    for (const [name, value] of Object.entries(attrs)) {
      if (value === undefined) expect(el).not.toHaveAttribute(name)
      else expect(el).toHaveAttribute(name, String(value))
    }
  })

  it('draws two lines: "number · SF" over the tenant or status in words', () => {
    render(<SuiteCell visual={visual('1010')} roving={roving} joinsNext={false} onSelect={() => {}} />)
    const el = screen.getByTestId('suite-odt-1010')
    expect(el).toHaveTextContent(/^1010 · 3,000 SFCommitted · starts 03\/2027$/)
    expect(el).toHaveAttribute('data-compact', 'false')
  })

  it('a suite under 2,500 SF shows its number alone', () => {
    render(<SuiteCell visual={visual('720')} roving={roving} joinsNext={false} onSelect={() => {}} />)
    const el = screen.getByTestId('suite-odt-720')
    expect(el).toHaveTextContent(/^720$/)
    expect(el).toHaveAttribute('data-compact', 'true')
    expect(el).toHaveAccessibleName(/Halcyon Tide Realty/)
  })

  it('shows Moves out and Moves in tags', () => {
    const { unmount } = render(<SuiteCell visual={visual('510', 'out')} roving={roving} joinsNext={false} onSelect={() => {}} />)
    const out = screen.getByTestId('suite-odt-510')
    expect(out).toHaveAttribute('data-move', 'out')
    expect(out).toHaveTextContent('Moves out')
    unmount()
    render(<SuiteCell visual={visual('410', 'in')} roving={roving} joinsNext={false} onSelect={() => {}} />)
    const arrival = screen.getByTestId('suite-odt-410')
    expect(arrival).toHaveAttribute('data-move', 'in')
    expect(arrival).toHaveTextContent('Moves in')
  })

  it('the tag carries a short form for narrow cells (the CSS picks one by cell width)', () => {
    const { unmount } = render(<SuiteCell visual={visual('510', 'out')} roving={roving} joinsNext={false} onSelect={() => {}} />)
    const out = screen.getByTestId('suite-odt-510')
    expect(within(out).getByText('Moves out')).toBeInTheDocument()
    expect(within(out).getByText('Out')).toBeInTheDocument()
    unmount()
    render(<SuiteCell visual={visual('410', 'in')} roving={roving} joinsNext={false} onSelect={() => {}} />)
    const arrival = screen.getByTestId('suite-odt-410')
    expect(within(arrival).getByText('Moves in')).toBeInTheDocument()
    expect(within(arrival).getByText('In')).toBeInTheDocument()
  })

  it('a suite without a move has no tag and no data-move', () => {
    render(<SuiteCell visual={visual('500')} roving={roving} joinsNext={false} onSelect={() => {}} />)
    const el = screen.getByTestId('suite-odt-500')
    expect(el).not.toHaveAttribute('data-move')
    expect(el).not.toHaveTextContent('Moves')
  })
})
