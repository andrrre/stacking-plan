import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BUNDLED_BUILDINGS } from '../../data'
import { SuiteCell } from './SuiteCell'
import { suiteDataAttributes } from './suiteAttributes'
import { buildStackModel, type SuiteVisual } from './suiteVisual'
import type { RovingItemProps } from './useRovingFocus'

const TODAY = '2026-11-15'
const roving: RovingItemProps = { tabIndex: 0, ref: () => {}, onFocus: () => {}, onKeyDown: () => {} }

function visual(number: string): SuiteVisual {
  const model = buildStackModel({
    building: BUNDLED_BUILDINGS[0], asOf: TODAY, today: TODAY, mode: 'availability', matches: [],
    highlightIds: null, modifiedIds: new Set(), selectedSuiteId: null,
  })
  const v = model.floors.flatMap((f) => f.suites).find((x) => x.suite.number === number)
  if (!v) throw new Error(`suite ${number} not in model`)
  return v
}

describe('SuiteCell', () => {
  it('uses the suite- test id by default and suite3d- when asked', () => {
    const v = visual('500')
    render(<SuiteCell visual={v} roving={roving} joinsNext={false} onSelect={() => {}} />)
    render(<SuiteCell visual={v} roving={roving} joinsNext={false} onSelect={() => {}} testIdPrefix="suite3d" />)
    expect(screen.getByTestId('suite-odt-500')).toHaveAttribute('data-status', 'vacant')
    expect(screen.getByTestId('suite3d-odt-500')).toHaveAttribute('data-status', 'vacant')
  })

  it('carries exactly the shared data attributes', () => {
    const v = visual('1010')
    render(<SuiteCell visual={v} roving={roving} joinsNext onSelect={() => {}} />)
    const el = screen.getByTestId('suite-odt-1010')
    const attrs = suiteDataAttributes(v, true)
    expect(attrs).toMatchObject({ 'data-status': 'vacant', 'data-overlay': 'committed', 'data-joins-next': 'true', 'data-has-cue': 'true' })
    for (const [name, value] of Object.entries(attrs)) {
      if (value === undefined) expect(el).not.toHaveAttribute(name)
      else expect(el).toHaveAttribute(name, String(value))
    }
  })
})
