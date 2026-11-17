import { describe, it, expect } from 'vitest'
import { fillNotes, localFill, readRequirement, understood } from './requirementFill'

const TODAY = '2026-11-15'
const HORIZON = '2031-11-15'

describe('readRequirement (the stream data part, validated)', () => {
  it('returns the requirement for a valid payload', () => {
    expect(readRequirement({ minSf: 9000, maxSf: 11000, maxRentPsf: 60, moveInBy: '2027-06-30' }, TODAY))
      .toEqual({ minSf: 9000, maxSf: 11000, maxRentPsf: 60, moveInBy: '2027-06-30' })
  })

  it('returns null for anything malformed: wrong types, missing size, extra keys, null, a string', () => {
    for (const bad of [null, undefined, 'x', 42, {}, { minSf: 'lots' }, { minSf: -5 }, { minSf: 10000, maxSf: 10 },
      { minSf: 10000, run: 'alert(1)' }, { minSf: 10000, moveInBy: 'soon' }]) {
      expect(readRequirement(bad, TODAY), JSON.stringify(bad)).toBeNull()
    }
  })

  it('clamps a past move-in date to today', () => {
    expect(readRequirement({ minSf: 5000, moveInBy: '2026-01-31' }, TODAY)).toEqual({ minSf: 5000, moveInBy: TODAY })
  })
})

describe('localFill (the offline parser)', () => {
  it('reads the law-firm requirement', () => {
    expect(localFill('Law firm, roughly 9–11k SF, moving in by Q2 next year, under $60', TODAY)).toEqual({
      parsed: { minSf: 9000, maxSf: 11000, maxRentPsf: 60, moveInBy: '2027-06-30' }, source: 'offline', applied: true,
    })
  })

  it('reads the suggested requirement question', () => {
    expect(localFill('Where could a 10,000 SF tenant go?', TODAY)?.parsed).toEqual({ minSf: 10000 })
  })

  it('returns null when nothing is understood, and for empty text', () => {
    expect(localFill('What is vacant on this date?', TODAY)).toBeNull()
    expect(localFill('Which leases expire soon?', TODAY)).toBeNull()
    expect(localFill('   ', TODAY)).toBeNull()
  })
})

describe('understood and fillNotes', () => {
  it('says what was understood in the form words', () => {
    expect(understood({ minSf: 9000, maxSf: 11000, maxRentPsf: 60, moveInBy: '2027-06-30' }))
      .toEqual(['9,000–11,000 SF', 'rent up to $60.00/SF', 'move in by 30 Jun 2027'])
    expect(understood({ minSf: 9000 })).toEqual(['at least 9,000 SF'])
    expect(understood({ maxSf: 9000 })).toEqual(['up to 9,000 SF'])
    expect(understood({})).toEqual([])
  })

  it('warns about a missing size and a move-in date past the horizon', () => {
    expect(fillNotes({ parsed: { moveInBy: '2027-06-30' }, source: 'offline', applied: true }, HORIZON))
      .toEqual(['Size not understood: enter a minimum size below to search.'])
    expect(fillNotes({ parsed: { maxSf: 5000 }, source: 'offline', applied: true }, HORIZON))
      .toEqual(['Minimum size not understood: enter one below to search.'])
    expect(fillNotes({ parsed: { minSf: 5000, moveInBy: '2035-12-31' }, source: 'ai', applied: true }, HORIZON))
      .toEqual(['Move-in date is beyond the 5-year view; showing Nov 2031.'])
    expect(fillNotes({ parsed: { minSf: 5000 }, source: 'ai', applied: true }, HORIZON)).toEqual([])
  })

  it('says the form was left alone when the broker edited it while the answer was coming', () => {
    expect(fillNotes({ parsed: { minSf: 5000 }, source: 'ai', applied: false }, HORIZON))
      .toEqual(['The form was edited while reading, so it was left as you typed it.'])
  })
})
