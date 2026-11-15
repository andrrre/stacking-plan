import { describe, it, expect } from 'vitest'
import { ParsedQuerySchema } from '../shared/ask.schema'
import { snapToSlider } from './dates'
import { parseQuery } from './parseQuery'
import type { ParsedQuery } from './types'

const TODAY = '2026-11-15'

const LAW_FIRM = 'Law firm, roughly 9–11k SF, moving in by Q2 next year, under $60'

describe('parseQuery: the law-firm query (spec A14)', () => {
  it('gives min 9,000, max 11,000, rent 60 and moveInBy 2027-06-30', () => {
    expect(parseQuery(LAW_FIRM, TODAY)).toEqual({ minSf: 9000, maxSf: 11000, maxRentPsf: 60, moveInBy: '2027-06-30' })
  })

  it('snaps to the 2027-06-01 slider step (D4)', () => {
    expect(snapToSlider('2027-06-30', TODAY)).toBe('2027-06-01')
  })
})

// A9 area forms. A single size is the minimum.
const AREA: [string, ParsedQuery][] = [
  ['10000', { minSf: 10000 }],
  ['10,000', { minSf: 10000 }],
  ['10k', { minSf: 10000 }],
  ['10.5k', { minSf: 10500 }],
  ['10K SF', { minSf: 10000 }],
  ['10,000 sq ft', { minSf: 10000 }],
  ['10000sf', { minSf: 10000 }],
  ['800 SF', { minSf: 800 }],
  ['9-11k', { minSf: 9000, maxSf: 11000 }],
  ['9–11k', { minSf: 9000, maxSf: 11000 }],
  ['9k-11k', { minSf: 9000, maxSf: 11000 }],
  ['9,000 to 11,000', { minSf: 9000, maxSf: 11000 }],
  ['between 9 and 11k', { minSf: 9000, maxSf: 11000 }],
  ['at least 10k', { minSf: 10000 }],
  ['up to 12,000 SF', { maxSf: 12000 }],
  ['max 12k', { maxSf: 12000 }],
  ['under 12,000 SF', { maxSf: 12000 }],
  ['~10k', { minSf: 10000 }],
  ['about 10k', { minSf: 10000 }],
  ['roughly 10,000 SF', { minSf: 10000 }],
  ['around 10k', { minSf: 10000 }],
  ['at least 9k, up to 11k', { minSf: 9000, maxSf: 11000 }],
]

// A9 rent forms: only with "$" or a per-foot unit.
const RENT: [string, ParsedQuery][] = [
  ['under $60', { maxRentPsf: 60 }],
  ['below $55.50', { maxRentPsf: 55.5 }],
  ['max $60', { maxRentPsf: 60 }],
  ['< $60', { maxRentPsf: 60 }],
  ['$60', { maxRentPsf: 60 }],
  ['60 psf', { maxRentPsf: 60 }],
  ['$60/sf', { maxRentPsf: 60 }],
  ['60 per sq ft', { maxRentPsf: 60 }],
  ['60 per foot', { maxRentPsf: 60 }],
  ['$50-$60 psf', { maxRentPsf: 60 }],
]

// A9 date forms, today = 2026-11-15.
const DATES: [string, ParsedQuery][] = [
  ['now', { moveInBy: TODAY }],
  ['today', { moveInBy: TODAY }],
  ['asap', { moveInBy: TODAY }],
  ['immediately', { moveInBy: TODAY }],
  ['by December', { moveInBy: '2026-12-31' }],
  ['by November', { moveInBy: '2026-11-30' }],
  ['by June', { moveInBy: '2027-06-30' }],
  ['by Feb 2028', { moveInBy: '2028-02-29' }],
  ['by June 2027', { moveInBy: '2027-06-30' }],
  ['by June next year', { moveInBy: '2027-06-30' }],
  ['by Q4', { moveInBy: '2026-12-31' }],
  ['by Q1', { moveInBy: '2027-03-31' }],
  ['by Q2 next year', { moveInBy: '2027-06-30' }],
  ['by Q3 2028', { moveInBy: '2028-09-30' }],
  ['by 2027', { moveInBy: '2027-12-31' }],
  ['by end of 2027', { moveInBy: '2027-12-31' }],
  ['by Q4 of next year', { moveInBy: '2027-12-31' }],
  ['by June of 2028', { moveInBy: '2028-06-30' }],
  ['by Q2 of 2028', { moveInBy: '2028-06-30' }],
  ['by 2027-06-30', { moveInBy: '2027-06-30' }],
]

const EDGES: [string, string, ParsedQuery][] = [
  ['no size at all', 'law firm moving in by June', { moveInBy: '2027-06-30' }],
  ['rent without $ or psf is ignored', 'under 60', {}],
  ['a bare number under 1000 is ignored', 'need 800 for 30 people', {}],
  ['reversed range bounds are swapped', '11k-9k', { minSf: 9000, maxSf: 11000 }],
  ['reversed "between" bounds are swapped', 'between 11 and 9k', { minSf: 9000, maxSf: 11000 }],
  ['a past date means today', 'by March 2025', { moveInBy: TODAY }],
  ['a past year means today', 'by 2025', { moveInBy: TODAY }],
  ['a year after a quarter is not a size', '12k SF, Q2 2027', { minSf: 12000 }],
  ['a quarter year written first is not a size', 'Q2 2027, 12k SF', { minSf: 12000 }],
  ['a range whose second number is not a size is not a range', '10k and 3 offices', { minSf: 10000 }],
  ['a size above 1,000,000 is ignored', '2,000,000 SF', {}],
  ['a rent above $1,000 is ignored', 'under $1,500 psf', {}],
  ['"$60k" is not a size', '$60k budget, 10k SF', { minSf: 10000 }],
  ['empty text', '', {}],
  ['whitespace only', '   ', {}],
  ['a max below a stated min is dropped', 'at least 10k, up to 8k', { minSf: 10000 }],
  // Review follow-up: years, head-counts and suite numbers are not sizes.
  ['a bare year is not a size', 'budget $60 psf, 2027 lease', { maxRentPsf: 60 }],
  ['a bare year before a size', '2027: 10k', { minSf: 10000 }],
  ['"year 2030" is not a size', 'year 2030', {}],
  ['a head-count is not a size', '2,500 employees, 10k', { minSf: 10000 }],
  ['a suite number is not a size', 'suite 1000, 5k sf', { minSf: 5000 }],
  ['a k or SF term outranks a bare number', '12000 or so, maybe 10k', { minSf: 10000 }],
  // Review follow-up: a minimum rent is not a maximum.
  ['"at least $50 psf" is not a max rent', 'at least $50 psf', {}],
  ['"over $50 psf" is not a max rent', 'over $50 psf', {}],
  ['"above $60/sf" is not a max rent', 'above $60/sf', {}],
  ['"min $50 psf" is not a max rent', 'min $50 psf', {}],
  ['"more than $50 psf" is not a max rent', 'more than $50 psf', {}],
  ['"from $50 psf" is not a max rent', 'from $50 psf', {}],
  ['a minimum rent next to a maximum', 'at least $50 psf, under $60', { maxRentPsf: 60 }],
  // Review follow-up: malformed numbers and rent ranges with "and".
  ['European thousands are unreadable', '9.000 SF', {}],
  ['"1,0000 sf" is unreadable', '1,0000 sf', {}],
  ['rent between $50 and $60', 'rent between $50 and $60', { maxRentPsf: 60 }],
  ['$50 and $60', '$50 and $60', { maxRentPsf: 60 }],
  ['$45-60 psf', '$45-60 psf', { maxRentPsf: 60 }],
  ['"by next year" is not in the grammar', 'by next year', {}],
  ['an invalid ISO date is no date', 'by 2027-13-45', {}],
  ['a past ISO date means today', 'by 2025-01-31', { moveInBy: TODAY }],
]

describe('parseQuery: A9 grammar', () => {
  it.each(AREA)('area %j', (text, expected) => {
    expect(parseQuery(text, TODAY)).toEqual(expected)
  })

  it.each(RENT)('rent %j', (text, expected) => {
    expect(parseQuery(text, TODAY)).toEqual(expected)
  })

  it.each(DATES)('date %j', (text, expected) => {
    expect(parseQuery(text, TODAY)).toEqual(expected)
  })

  it.each(EDGES)('%s: %j', (_name, text, expected) => {
    expect(parseQuery(text, TODAY)).toEqual(expected)
  })

  it('"by June" in a year where June has passed means next June', () => {
    expect(parseQuery('by June', '2026-11-15').moveInBy).toBe('2027-06-30')
    expect(parseQuery('by June', '2026-03-10').moveInBy).toBe('2026-06-30')
  })

  it('a date beyond the five-year horizon is kept, and the slider snaps it to step 60', () => {
    const parsed = parseQuery('10k SF by 2035', TODAY)
    expect(parsed).toEqual({ minSf: 10000, moveInBy: '2035-12-31' })
    expect(snapToSlider(parsed.moveInBy ?? '', TODAY)).toBe('2031-11-01')
  })

  it('reads only the first 500 characters', () => {
    const padded = `${'x'.repeat(498)} 10k SF`
    expect(parseQuery(padded, TODAY)).toEqual({})
    expect(parseQuery(`${'x'.repeat(480)} 10k SF`, TODAY)).toEqual({ minSf: 10000 })
  })

  it('runs in linear-ish time on crafted 500-character inputs', () => {
    const crafted = [
      '9'.repeat(500),
      '1,'.repeat(250),
      '9-'.repeat(250),
      '$1 to '.repeat(83),
      'by q2 of '.repeat(55),
      'at least '.repeat(55),
      '1.'.repeat(250),
      'suite 1000 '.repeat(45),
    ]
    for (const text of crafted) {
      const start = performance.now()
      parseQuery(text, TODAY)
      expect(performance.now() - start, text.slice(0, 20)).toBeLessThan(50)
    }
  })

  it('combines size, rent and date in any order', () => {
    expect(parseQuery('by 2027, under $55 psf, at least 10k SF', TODAY))
      .toEqual({ minSf: 10000, maxRentPsf: 55, moveInBy: '2027-12-31' })
  })

  it.each([...AREA, ...RENT, ...DATES].map(([t]) => t).concat(LAW_FIRM))('output passes ParsedQuerySchema: %j', (text) => {
    expect(ParsedQuerySchema.safeParse(parseQuery(text, TODAY)).success).toBe(true)
  })
})
