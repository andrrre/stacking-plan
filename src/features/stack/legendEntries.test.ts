import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { building, floor, suite } from '../../domain/testing/fixtures'
import type { Building, ISODate } from '../../domain/types'
import type { ColourMode } from '../../app/state/types'
import { legendEntries, legendMeta } from './legendEntries'
import { buildStackModel } from './suiteVisual'

const TODAY = '2026-11-15'
const JUL = '2027-07-01'
const ODT = BUNDLED_BUILDINGS[0]

function entries(mode: ColourMode = 'availability', asOf: ISODate = TODAY, b: Building = ODT) {
  const model = buildStackModel({
    building: b, asOf, today: TODAY, mode, matches: [], highlightIds: null, modifiedIds: new Set(), selectedSuiteId: null,
  })
  return legendEntries(model, mode)
}

const byKey = (mode: ColourMode, asOf: ISODate = TODAY) => new Map(entries(mode, asOf).map((e) => [e.key, e]))

describe('legendEntries', () => {
  it('availability: one pill per status, in the handoff order, with its name', () => {
    expect(entries().map((e) => [e.key, e.label])).toEqual([
      ['vacant', 'Vacant'], ['potential', 'Potential'], ['expiring', 'Expiring ≤ 12 mo'],
      ['committed', 'Committed'], ['occupied', 'Occupied'], ['common', 'Common area'],
    ])
  })

  it('counts suites and sums SF per status for the building as of the date', () => {
    const e = byKey('availability')
    expect(e.get('vacant')).toMatchObject({ count: 6, sf: 5600 + 4800 + 4000 + 10250 + 4300 + 6200 })
    expect(e.get('committed')).toMatchObject({ count: 1, sf: 3000 })
    expect(e.get('potential')).toMatchObject({ count: 0, sf: 0 })
    expect(e.get('common')).toMatchObject({ count: 3, sf: 7200 + 3000 + 2200 })
    const total = entries().reduce((n, x) => n + x.count, 0)
    expect(total).toBe(32) // every suite is in exactly one pill
  })

  it('moves with the as-of date: 600 is potential in July 2027', () => {
    expect(byKey('availability', JUL).get('potential')).toMatchObject({ count: 1, sf: 12400 })
  })

  it('lease risk: the ramp between the vacant overlays and common areas, every suite counted once', () => {
    const e = entries('risk')
    expect(e.map((x) => x.key)).toEqual([
      'vacant', 'potential', 'committed', 'risk-le6', 'risk-le12', 'risk-le24', 'risk-le36', 'risk-gt36', 'risk-open', 'common',
    ])
    expect(e.find((x) => x.key === 'risk-le6')).toMatchObject({ label: '≤ 6 months', count: 1, sf: 12400 })
    expect(e.reduce((n, x) => n + x.count, 0)).toBe(32)
  })

  it('an empty building gives zero counts, not missing pills', () => {
    const b = building({ floors: [floor({ number: 1, suites: [suite({ kind: 'common', name: 'Lobby' })] })] })
    const e = entries('availability', TODAY, b)
    expect(e).toHaveLength(6)
    expect(e.filter((x) => x.count > 0).map((x) => x.key)).toEqual(['common'])
  })
})

describe('legendMeta', () => {
  it('"N suites · X SF", singular for one, no SF for none', () => {
    expect(legendMeta(6, 35150)).toBe('6 suites · 35,150 SF')
    expect(legendMeta(1, 3000)).toBe('1 suite · 3,000 SF')
    expect(legendMeta(0, 0)).toBe('0 suites')
  })
})
