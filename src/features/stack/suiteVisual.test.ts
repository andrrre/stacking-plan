import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import type { Building, Candidate, ISODate } from '../../domain/types'
import { building, floor, lease, suite } from '../../domain/testing/fixtures'
import { buildStackModel, type StackModel, type SuiteVisual } from './suiteVisual'

const TODAY = '2026-11-15'
const JUL = '2027-07-01'
const ODT = BUNDLED_BUILDINGS[0]

type Input = Parameters<typeof buildStackModel>[0]

function model(over: Partial<Input> = {}): StackModel {
  return buildStackModel({
    building: ODT,
    asOf: TODAY,
    today: TODAY,
    mode: 'availability',
    matches: [],
    highlightIds: null,
    modifiedIds: new Set(),
    selectedSuiteId: null,
    legend: null,
    ...over,
  })
}

function visual(m: StackModel, number: string): SuiteVisual {
  const found = m.floors.flatMap((f) => f.suites).find((v) => v.suite.number === number)
  if (!found) throw new Error(`suite ${number} not in model`)
  return found
}

function candidate(suiteIds: string[], floorNumber: number, availableFrom: ISODate = TODAY): Candidate {
  return {
    key: suiteIds.join('+'),
    suiteIds,
    suiteNumbers: suiteIds.map((id) => id.replace('odt-', '')),
    floor: floorNumber,
    totalSf: 10000,
    excessSf: 0,
    blendedRentPsf: 50,
    availableFrom,
    availability: 'now',
    caveats: [],
  }
}

const MATCHES = [candidate(['odt-500'], 5), candidate(['odt-700', 'odt-710'], 7)]

describe('buildStackModel: floors and widths', () => {
  it('sorts floors by number, descending, with every suite', () => {
    const m = model()
    expect(m.floors.map((f) => f.number)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
    expect(m.floors.flatMap((f) => f.suites)).toHaveLength(32)
  })

  it('scales floor width to the largest plate, so floor 12 is narrower than floor 11', () => {
    const m = model()
    const f12 = m.floors.find((f) => f.number === 12)
    const f11 = m.floors.find((f) => f.number === 11)
    expect(f12?.plateSf).toBe(10800)
    expect(f11?.plateSf).toBe(12400)
    expect(f11?.widthPct).toBe(100)
    expect(f12?.widthPct).toBeCloseTo((10800 / 12400) * 100)
    expect(f12?.widthPct ?? 100).toBeLessThan(f11?.widthPct ?? 0)
  })

  it('keeps suites in stored order within a floor', () => {
    const f4 = model().floors.find((f) => f.number === 4)
    expect(f4?.suites.map((v) => v.suite.number)).toEqual(['400', '410', '420', '430'])
  })

  it('sorts floors stored out of order', () => {
    const b: Building = building({ floors: [floor({ number: 1 }), floor({ number: 3 }), floor({ number: 2 })] })
    expect(model({ building: b }).floors.map((f) => f.number)).toEqual([3, 2, 1])
  })
})

describe('buildStackModel: labels', () => {
  it('line 2 is the tenant or the status in words, as of the date', () => {
    const m = model()
    expect(visual(m, '500').label.line2).toBe('Vacant')
    expect(visual(m, '900').label.line2).toBe('Coralstone Insurance')
    expect(visual(m, '600').label.line2).toBe('Flamingo Row Media · ends 04/2027')
    expect(visual(m, '1010').label.line2).toBe('Committed · starts 03/2027')
    expect(visual(m, '100').label.line2).toBe('Lobby')
    expect(visual(model({ asOf: JUL }), '600').label.line2).toBe('Potential · was Flamingo Row Media')
  })

  it('lease risk mode adds the lease end to a leased suite', () => {
    expect(visual(model({ mode: 'risk' }), '900').label.line2).toBe('Coralstone Insurance · ends 12/2029')
  })

  it('carries the suite number and SF, and marks small suites compact', () => {
    expect(visual(model(), '500').label).toMatchObject({ number: '500', sf: '10,250 SF', compact: false })
    expect(visual(model(), '720').label.compact).toBe(true)
  })
})

describe('buildStackModel: aria-label', () => {
  it('vacant: "Suite 500, floor 5, vacant, 10,250 SF"', () => {
    expect(visual(model(), '500').ariaLabel).toBe('Suite 500, floor 5, vacant, 10,250 SF')
  })

  it('expiring: tenant, SF, status and long end date', () => {
    expect(visual(model(), '600').ariaLabel).toBe(
      'Suite 600, floor 6, Flamingo Row Media, 12,400 SF, expiring, lease ends 30 Apr 2027',
    )
  })

  it('potential at 2027-07-01 names the ended lease', () => {
    const label = visual(model({ asOf: JUL }), '600').ariaLabel
    expect(label).toBe('Suite 600, floor 6, vacant, 12,400 SF, potential: Flamingo Row Media lease ends 30 Apr 2027')
    expect(label).toContain('potential: Flamingo Row Media lease ends 30 Apr 2027')
  })

  it('committed names the next lease', () => {
    expect(visual(model(), '1010').ariaLabel).toBe(
      'Suite 1010, floor 10, vacant, 3,000 SF, committed: Bayfront Dental Group lease starts 1 Mar 2027',
    )
  })

  it('open-ended and vacating leases say so', () => {
    expect(visual(model(), '230').ariaLabel).toBe('Suite 230, floor 2, Gullwing Print Co, 3,300 SF, occupied, no end date')
    expect(visual(model(), '400').ariaLabel).toBe(
      'Suite 400, floor 4, Sunquay Logistics, 6,100 SF, expiring, lease ends 31 May 2027, vacant from 1 Jun 2027',
    )
  })

  it('common suites read as common area', () => {
    expect(visual(model(), '100').ariaLabel).toBe('Suite 100, floor 1, Lobby, 7,200 SF, common area')
  })

  it('matches add ", match N"; modified adds ", modified"', () => {
    const m = model({ matches: MATCHES, modifiedIds: new Set(['odt-500']) })
    expect(visual(m, '500').ariaLabel).toBe('Suite 500, floor 5, vacant, 10,250 SF, match 1, modified')
    expect(visual(m, '710').ariaLabel).toContain(', match 2')
    expect(visual(m, '600').ariaLabel).not.toContain('match')
  })

  it('risk mode adds the lease-risk bucket for leased suites', () => {
    const m = model({ mode: 'risk' })
    expect(visual(m, '600').ariaLabel).toContain(', lease risk: 6 months or less')
    expect(visual(m, '900').ariaLabel).toContain(', lease risk: over 36 months')
    expect(visual(m, '500').ariaLabel).not.toContain('lease risk')
    expect(visual(model(), '600').ariaLabel).not.toContain('lease risk')
  })
})

describe('buildStackModel: tooltip', () => {
  it('600 at 2027-07-01 starts with "Potential · Flamingo Row Media lease ends 04/2027"', () => {
    expect(visual(model({ asOf: JUL }), '600').tooltip.startsWith('Potential · Flamingo Row Media lease ends 04/2027')).toBe(true)
  })

  it('holds the full text: headline, suite, floor, SF and tags', () => {
    expect(visual(model(), '400').tooltip).toBe(
      'Sunquay Logistics · lease ends 05/2027\nSuite 400 · Floor 4 · 6,100 SF\nVacant from 06/2027',
    )
    expect(visual(model(), '1010').tooltip.startsWith('Leased from 03/2027 · Bayfront Dental Group')).toBe(true)
    expect(visual(model(), '500').tooltip).toBe('Vacant\nSuite 500 · Floor 5 · 10,250 SF')
    expect(visual(model(), '230').tooltip).toContain('No end date')
  })

  it('adds match and modified lines', () => {
    const v = visual(model({ matches: MATCHES, modifiedIds: new Set(['odt-500']) }), '500')
    expect(v.tooltip).toContain('Match 1')
    expect(v.tooltip).toContain('Modified')
  })
})

describe('buildStackModel: fills and risk', () => {
  it('availability mode fills by status and overlay', () => {
    const m = model()
    const fills = ['900', '600', '500', '1010', '100'].map((n) => visual(m, n).fill)
    expect(fills).toEqual(['occupied', 'expiring', 'vacant', 'committed', 'common'])
    expect(visual(model({ asOf: JUL }), '600').fill).toBe('potential')
  })

  it('risk mode gives risk fills; vacant suites keep their overlays', () => {
    const m = model({ mode: 'risk' })
    const fills = ['600', '400', '220', '1000', '210', '420', '810', '900', '230'].map((n) => visual(m, n).fill)
    expect(fills).toEqual([
      'risk-le6', 'risk-le12', 'risk-le12', 'risk-le12', 'risk-le24', 'risk-le24', 'risk-le36', 'risk-gt36', 'risk-open',
    ])
    expect(visual(m, '500').fill).toBe('vacant')
    expect(visual(m, '1010').fill).toBe('committed')
    expect(visual(m, '100').fill).toBe('common')
    expect(visual(model({ mode: 'risk', asOf: JUL }), '600').fill).toBe('potential')
  })

  it('exposes the risk bucket in both modes', () => {
    expect(visual(model(), '600').risk).toBe('le6')
    expect(visual(model(), '230').risk).toBe('openEnded')
    expect(visual(model(), '500').risk).toBe('vacant')
  })
})

describe('buildStackModel: matches, highlight, dimming', () => {
  it('nothing is dimmed with no matches and no highlight', () => {
    expect(model().floors.flatMap((f) => f.suites).some((v) => v.dimmed)).toBe(false)
  })

  it('with matches, non-matches are dimmed and matches carry their rank', () => {
    const m = model({ matches: MATCHES })
    expect(visual(m, '500')).toMatchObject({ matchRank: 1, dimmed: false })
    expect(visual(m, '700')).toMatchObject({ matchRank: 2, dimmed: false })
    expect(visual(m, '710')).toMatchObject({ matchRank: 2, dimmed: false })
    expect(visual(m, '600')).toMatchObject({ matchRank: null, dimmed: true })
    expect(visual(m, '100').dimmed).toBe(true)
  })

  it('a suite in two candidates takes the best rank', () => {
    const m = model({ matches: [candidate(['odt-700', 'odt-710'], 7), candidate(['odt-700'], 7)] })
    expect(visual(m, '700').matchRank).toBe(1)
  })

  it('floors carry match runs as first and last suite index', () => {
    const m = model({ matches: MATCHES })
    expect(m.floors.find((f) => f.number === 7)?.runs).toEqual([{ rank: 2, first: 0, last: 1 }])
    expect(m.floors.find((f) => f.number === 5)?.runs).toEqual([{ rank: 1, first: 0, last: 0 }])
    expect(m.floors.find((f) => f.number === 6)?.runs).toEqual([])
  })

  it('highlightIds dims non-highlighted suites and replaces the match overlay', () => {
    const m = model({ matches: MATCHES, highlightIds: new Set(['odt-700', 'odt-710']) })
    expect(visual(m, '700')).toMatchObject({ dimmed: false, matchRank: null })
    expect(visual(m, '710').dimmed).toBe(false)
    expect(visual(m, '500')).toMatchObject({ dimmed: true, matchRank: null })
    expect(m.floors.every((f) => f.runs.length === 0)).toBe(true)
    expect(visual(m, '500').ariaLabel).not.toContain('match')
  })

  it('an empty highlight set dims everything', () => {
    const m = model({ highlightIds: new Set() })
    expect(m.floors.flatMap((f) => f.suites).every((v) => v.dimmed)).toBe(true)
  })
})

describe('buildStackModel: legend filter', () => {
  const all = (m: StackModel) => m.floors.flatMap((f) => f.suites)

  it('nothing is filtered without a legend key', () => {
    expect(all(model()).some((v) => v.filtered)).toBe(false)
  })

  it('filters every suite painted otherwise than the key', () => {
    const m = model({ legend: 'vacant' })
    const lit = all(m).filter((v) => !v.filtered).map((v) => v.suite.number).sort()
    expect(lit).toEqual(['300', '310', '410', '500', '700', '710'])
  })

  it('follows the as-of date and the colour mode: the key is the fill', () => {
    expect(visual(model({ legend: 'potential', asOf: JUL }), '600').filtered).toBe(false)
    expect(visual(model({ legend: 'expiring', asOf: JUL }), '600').filtered).toBe(true)
    expect(visual(model({ legend: 'expiring' }), '600').filtered).toBe(false)
    expect(visual(model({ legend: 'risk-le6', mode: 'risk' }), '600').filtered).toBe(false)
    expect(visual(model({ legend: 'risk-le6', mode: 'risk' }), '900').filtered).toBe(true)
  })

  it('a key no suite carries filters nothing: the whole building stays lit (committed is gone by July 2027)', () => {
    expect(all(model({ legend: 'committed' })).filter((v) => !v.filtered).map((v) => v.suite.number)).toEqual(['1010'])
    expect(all(model({ legend: 'committed', asOf: JUL })).some((v) => v.filtered)).toBe(false)
    expect(all(model({ legend: 'potential' })).some((v) => v.filtered)).toBe(false)
  })

  it('a search match stays lit under the filter, whatever it is painted as', () => {
    const m = model({ legend: 'expiring', matches: MATCHES })
    expect(visual(m, '500')).toMatchObject({ fill: 'vacant', matchRank: 1, dimmed: false, filtered: false })
    expect(visual(m, '700')).toMatchObject({ matchRank: 2, filtered: false })
    expect(visual(m, '900')).toMatchObject({ dimmed: true, filtered: true })
  })

  it('says "filtered out" in the accessible name of a suite the filter leaves out, and only then', () => {
    const m = model({ legend: 'vacant' })
    expect(visual(m, '600').ariaLabel).toMatch(/, filtered out$/)
    expect(visual(m, '500').ariaLabel).not.toContain('filtered out')
    expect(all(model()).some((v) => v.ariaLabel.includes('filtered out'))).toBe(false)
    expect(all(model({ legend: 'committed', asOf: JUL })).some((v) => v.ariaLabel.includes('filtered out'))).toBe(false)
  })

  it('is separate from search dimming: a suite may be dimmed, filtered, both or neither', () => {
    const m = model({ legend: 'vacant', matches: MATCHES })
    expect(visual(m, '500')).toMatchObject({ dimmed: false, filtered: false })
    expect(visual(m, '300')).toMatchObject({ dimmed: true, filtered: false })
    expect(visual(m, '600')).toMatchObject({ dimmed: true, filtered: true })
  })

  it('a selected suite stays selected when filtered', () => {
    expect(visual(model({ legend: 'vacant', selectedSuiteId: 'odt-600' }), '600')).toMatchObject({ selected: true, filtered: true })
  })
})

describe('buildStackModel: modified and selected', () => {
  it('marks modified suites', () => {
    const m = model({ modifiedIds: new Set(['odt-500']) })
    expect(visual(m, '500').modified).toBe(true)
    expect(visual(m, '510').modified).toBe(false)
  })

  it('marks the selected suite only', () => {
    const m = model({ selectedSuiteId: 'odt-600' })
    expect(visual(m, '600').selected).toBe(true)
    expect(m.floors.flatMap((f) => f.suites).filter((v) => v.selected)).toHaveLength(1)
  })
})

describe('buildStackModel: edge cases', () => {
  it('a vacant suite whose vacating lease has ended reads plain Vacant, tagged "Vacant from MM/YYYY"', () => {
    const v = visual(model({ asOf: JUL }), '400')
    expect(v.status).toMatchObject({ status: 'vacant', overlay: 'none' })
    expect(v.label.line2).toBe('Vacant')
    expect(v.fill).toBe('vacant')
    expect(v.ariaLabel).toBe('Suite 400, floor 4, vacant, 6,100 SF, vacant from 1 Jun 2027')
    expect(v.tooltip).toBe('Vacant\nSuite 400 · Floor 4 · 6,100 SF\nVacant from 06/2027')
  })

  it('space vacant since before today carries no "Vacant from" line', () => {
    expect(visual(model({ asOf: JUL }), '500').tooltip).toBe('Vacant\nSuite 500 · Floor 5 · 10,250 SF')
    expect(visual(model(), '700').tooltip).toBe('Vacant\nSuite 700 · Floor 7 · 4,300 SF')
  })

  it('a common suite without a name falls back to "Common area"', () => {
    const b = building({ floors: [floor({ number: 1, suites: [suite({ kind: 'common', number: '100' })] })] })
    const v = model({ building: b }).floors[0]?.suites[0]
    expect(v?.label.line2).toBe('Common area')
    expect(v?.ariaLabel).toBe('Suite 100, floor 1, Common area, 1,000 SF, common area')
  })

  it('ignores candidates whose suites are not in the building', () => {
    const b = building({ floors: [floor({ number: 1, suites: [suite({ leases: [lease()] })] })] })
    const m = model({ building: b, matches: MATCHES })
    expect(m.floors[0]?.runs).toEqual([])
    expect(m.floors[0]?.suites[0]?.dimmed).toBe(true)
  })
})
