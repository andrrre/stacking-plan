import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { findFits, suiteCandidate } from '../../domain/findFits'
import { building, floor, lease, suite } from '../../domain/testing/fixtures'
import type { Candidate } from '../../domain/types'
import { createEntry } from '../shortlist/entryId'
import { tourFrom, tourStops, type StopInput } from './tourStops'

const TODAY = '2026-11-15'
const hero = BUNDLED_BUILDINGS[0]

// Two floors: 2 holds a vacant 200 and 210 either side of an occupied 205; 1 holds a vacant 100 and 110, which
// is let until 2026-12-31 (potential space from 2027 on), and an occupied 120.
const small = building({
  id: 'small',
  floors: [
    floor({ number: 1, suites: [
      suite({ id: 's-100', number: '100' }),
      suite({ id: 's-110', number: '110', leases: [lease({ tenant: 'Ending Co', start: '2021-01-01', end: '2026-12-31' })] }),
      suite({ id: 's-120', number: '120', leases: [lease({ tenant: 'Staying Co', start: '2024-01-01', end: '2034-12-31' })] }),
    ] }),
    floor({ number: 2, suites: [
      suite({ id: 's-200', number: '200' }),
      suite({ id: 's-205', number: '205', leases: [lease({ tenant: 'Middle Co', start: '2024-01-01', end: '2034-12-31' })] }),
      suite({ id: 's-210', number: '210' }),
    ] }),
  ],
})

const input = (over: Partial<StopInput> = {}): StopInput => ({
  building: small, buildingId: small.id, asOf: TODAY, today: TODAY, shortlist: [], matches: [], includePotential: false, ...over,
})

const keys = (stops: readonly Candidate[]) => stops.map((s) => s.key)

describe('tourStops', () => {
  it('without a shortlist or a search: every available suite, top floor first, left to right', () => {
    expect(keys(tourStops(input()))).toEqual(['s-200', 's-210', 's-100'])
  })

  it('potential space joins only with Include potential space on', () => {
    const asOf = '2027-03-01' // Ending Co's lease is over: 110 is potential space then
    expect(keys(tourStops(input({ asOf })))).toEqual(['s-200', 's-210', 's-100'])
    expect(keys(tourStops(input({ asOf, includePotential: true })))).toEqual(['s-200', 's-210', 's-100', 's-110'])
  })

  it('with a search: the matches, in rank order', () => {
    const matches = findFits(hero, { minSf: 10_000, includePotential: true }, TODAY, TODAY)
    const stops = tourStops(input({ building: hero, buildingId: hero.id, matches }))
    expect(keys(stops)).toEqual(keys(matches))
    expect(stops.length).toBeGreaterThan(0)
  })

  it('a shortlist for this building and date wins over a search; a multi-suite option is one stop', () => {
    const matches = findFits(hero, { minSf: 10_000, includePotential: true }, TODAY, TODAY)
    const pair = matches.find((c) => c.suiteIds.length > 1) as Candidate
    const one = matches.find((c) => c.suiteIds.length === 1) as Candidate
    const shortlist = [
      createEntry(hero.id, pair, TODAY, false),
      createEntry(hero.id, one, '2027-01-01', false), // another date: not toured
      createEntry('other', one, TODAY, false), // another building: not toured
      createEntry(hero.id, one, TODAY, false),
    ]
    const stops = tourStops(input({ building: hero, buildingId: hero.id, matches, shortlist }))
    expect(keys(stops)).toEqual([pair.key, one.key])
    expect(stops[0]?.suiteIds).toEqual(pair.suiteIds)
  })

  it('the same option saved as a what-if too is one stop', () => {
    const one = suiteCandidate(small.floors[1] ?? floor(), suite({ id: 's-200', number: '200' }), TODAY, TODAY, false) as Candidate
    const shortlist = [createEntry(small.id, one, TODAY, false), createEntry(small.id, one, TODAY, true)]
    expect(keys(tourStops(input({ shortlist })))).toEqual(['s-200'])
  })

  it('a shortlisted option whose suites the building no longer has is left out', () => {
    const ghost = { ...(suiteCandidate(small.floors[1] ?? floor(), suite({ id: 's-gone', number: '999' }), TODAY, TODAY, false) as Candidate) }
    expect(keys(tourStops(input({ shortlist: [createEntry(small.id, ghost, TODAY, false)] })))).toEqual(['s-200', 's-210', 's-100'])
  })

  it('a search with no match falls back to the available suites', () => {
    expect(keys(tourStops(input({ matches: [] })))).toEqual(['s-200', 's-210', 's-100'])
  })

  it('nothing available: no stops', () => {
    const full = building({ floors: [floor({ suites: [suite({ leases: [lease({ start: '2024-01-01', end: '2034-12-31' })] })] })] })
    expect(tourStops(input({ building: full, buildingId: full.id }))).toEqual([])
  })

  it('common areas are never a stop', () => {
    const lobby = building({ floors: [floor({ suites: [suite({ kind: 'common' })] })] })
    expect(tourStops(input({ building: lobby, buildingId: lobby.id }))).toEqual([])
  })
})

describe('tourFrom', () => {
  const stops = tourStops(input())

  it('starts at the stop that holds the suite', () => {
    expect(tourFrom(stops, 's-210', null)).toEqual({ stops, index: 1 })
  })

  it('a suite no stop holds gets its own stop, first', () => {
    const own = { ...(stops[2] as Candidate), key: 's-x', suiteIds: ['s-x'] }
    const r = tourFrom(stops, 's-x', own)
    expect(r.index).toBe(0)
    expect(keys(r.stops)).toEqual(['s-x', 's-200', 's-210', 's-100'])
  })

  it('a suite with no stop and no candidate of its own starts at the first stop', () => {
    expect(tourFrom(stops, 's-205', null)).toEqual({ stops, index: 0 })
  })
})
