import { describe, it, expect } from 'vitest'
import { BuildingSchema, CandidateSchema, FloorSchema, LeaseSchema, SuiteSchema, noOverlaps } from './domain.schema'

type L = { start: string; end: string | null }

const lease = ({ start, end }: L, i = 0) => ({ id: `l${i}`, tenant: 'T', start, end, rentPsf: 40 })
const suite = (leases: L[], extra: Record<string, unknown> = {}) => ({
  id: 's1', number: '100', areaSf: 1000, kind: 'leasable', askingRentPsf: 40, joinsNext: false,
  leases: leases.map(lease), ...extra,
})
const valid = (leases: L[]) => SuiteSchema.safeParse(suite(leases)).success

describe('SuiteSchema overlap rule', () => {
  it('accepts no leases, one lease and disjoint leases', () => {
    expect(valid([])).toBe(true)
    expect(valid([{ start: '2020-01-01', end: '2024-12-31' }])).toBe(true)
    expect(valid([{ start: '2020-01-01', end: '2024-12-31' }, { start: '2025-01-01', end: null }])).toBe(true)
  })

  it('is inclusive: a lease starting on the last day of another overlaps (touching leases)', () => {
    expect(valid([{ start: '2020-01-01', end: '2024-12-31' }, { start: '2024-12-31', end: '2026-12-31' }])).toBe(false)
  })

  it('an open-ended lease overlaps every later start', () => {
    expect(valid([{ start: '2020-01-01', end: null }, { start: '2040-01-01', end: '2041-01-01' }])).toBe(false)
    expect(valid([{ start: '2020-01-01', end: null }, { start: '2030-01-01', end: null }])).toBe(false)
  })

  it('catches containment and identical leases', () => {
    expect(valid([{ start: '2020-01-01', end: '2030-12-31' }, { start: '2022-01-01', end: '2023-01-01' }])).toBe(false)
    expect(valid([{ start: '2020-01-01', end: '2021-01-01' }, { start: '2020-01-01', end: '2021-01-01' }])).toBe(false)
  })

  it('catches an overlap in unsorted input, including one between non-adjacent entries', () => {
    expect(valid([
      { start: '2030-01-01', end: '2031-12-31' },
      { start: '2020-01-01', end: '2021-12-31' },
      { start: '2025-01-01', end: '2026-12-31' },
    ])).toBe(true)
    // The long lease 2010–2040 swallows a later one that is not its neighbour in input order.
    expect(valid([
      { start: '2030-01-01', end: '2031-12-31' },
      { start: '2020-01-01', end: '2021-12-31' },
      { start: '2010-01-01', end: '2040-12-31' },
    ])).toBe(false)
    // After sorting, a long first lease overlaps the third even though the second sits in between and ends early.
    expect(valid([
      { start: '2028-01-01', end: '2029-01-01' },
      { start: '2010-01-01', end: '2035-01-01' },
      { start: '2012-01-01', end: '2013-01-01' },
    ])).toBe(false)
  })

  it('the overlap check grows near-linearly: 4× the leases costs well under 16× the work', () => {
    // Counts reads of `start` (one or two per comparison), which a quadratic pairwise check would multiply by 16.
    const work = (n: number) => {
      let reads = 0
      const leases = Array.from({ length: n }, (_, i) => {
        const d = isoDay(i)
        return { get start() { reads += 1; return d }, end: d }
      }).reverse()
      expect(noOverlaps(leases)).toBe(true)
      return reads
    }
    const ratio = work(8000) / work(2000)
    expect(ratio).toBeGreaterThan(3.5)
    expect(ratio).toBeLessThan(6)
  })

  it('validates a suite with the maximum 2,000 disjoint leases', () => {
    const leases = Array.from({ length: 2000 }, (_, i) => ({ start: isoDay(i), end: isoDay(i) })).reverse()
    expect(SuiteSchema.safeParse(suite(leases)).success).toBe(true)
  })
})

describe('schema bounds', () => {
  const longText = (n: number) => 'x'.repeat(n)
  const building = (extra: Record<string, unknown> = {}) => ({
    id: 'b1', name: 'B', address: '1 Main St', floors: [{ number: 1, suites: [suite([])] }], ...extra,
  })

  it('accepts data at every bound', () => {
    expect(LeaseSchema.safeParse({ ...lease({ start: '2020-01-01', end: null }), id: longText(120), tenant: longText(80) }).success).toBe(true)
    expect(SuiteSchema.safeParse(suite([], { id: longText(120), number: longText(20), name: longText(60) })).success).toBe(true)
    expect(BuildingSchema.safeParse(building({ id: longText(120), name: longText(80), address: longText(200) })).success).toBe(true)
  })

  it('rejects over-long strings', () => {
    expect(LeaseSchema.safeParse({ ...lease({ start: '2020-01-01', end: null }), id: longText(121) }).success).toBe(false)
    expect(LeaseSchema.safeParse({ ...lease({ start: '2020-01-01', end: null }), tenant: longText(81) }).success).toBe(false)
    expect(SuiteSchema.safeParse(suite([], { id: longText(121) })).success).toBe(false)
    expect(SuiteSchema.safeParse(suite([], { number: longText(21) })).success).toBe(false)
    expect(BuildingSchema.safeParse(building({ id: longText(121) })).success).toBe(false)
    expect(BuildingSchema.safeParse(building({ name: longText(81) })).success).toBe(false)
    expect(BuildingSchema.safeParse(building({ address: longText(201) })).success).toBe(false)
  })

  it('rejects more than 2,000 leases per suite', () => {
    const many = Array.from({ length: 2001 }, () => ({ start: '2020-01-01', end: '2020-01-01' }))
    expect(SuiteSchema.safeParse(suite(many)).success).toBe(false)
  })

  it('rejects more than 200 suites per floor and more than 250 floors', () => {
    const suites = (n: number) => Array.from({ length: n }, (_, i) => suite([], { id: `s${i}`, number: `${i}` }))
    expect(FloorSchema.safeParse({ number: 1, suites: suites(200) }).success).toBe(true)
    expect(FloorSchema.safeParse({ number: 1, suites: suites(201) }).success).toBe(false)
    const floors = (n: number) => Array.from({ length: n }, (_, i) => ({ number: i + 1, suites: [suite([])] }))
    expect(BuildingSchema.safeParse(building({ floors: floors(250) })).success).toBe(true)
    expect(BuildingSchema.safeParse(building({ floors: floors(251) })).success).toBe(false)
  })

  it('rejects a lease ending 9999-12-31', () => {
    expect(LeaseSchema.safeParse(lease({ start: '2020-01-01', end: '9999-12-31' })).success).toBe(false)
  })

  describe('CandidateSchema', () => {
    const candidate = (extra: Record<string, unknown> = {}) => ({
      key: 's1', suiteIds: ['s1'], suiteNumbers: ['100'], floor: 1, totalSf: 1000, excessSf: 0, blendedRentPsf: 40,
      availableFrom: '2026-11-15', availability: 'now', caveats: [], ...extra,
    })
    const ids = (n: number, len = 3) => Array.from({ length: n }, (_, i) => `${i}`.padStart(len, 'x'))

    it('accepts up to 50 suites with ids up to 120 and numbers up to 20 characters', () => {
      expect(CandidateSchema.safeParse(candidate({ suiteIds: ids(50, 120), suiteNumbers: ids(50, 20) })).success).toBe(true)
    })

    it('rejects more than 50 suites or over-long ids and numbers', () => {
      expect(CandidateSchema.safeParse(candidate({ suiteIds: ids(51) })).success).toBe(false)
      expect(CandidateSchema.safeParse(candidate({ suiteNumbers: ids(51) })).success).toBe(false)
      expect(CandidateSchema.safeParse(candidate({ suiteIds: [longText(121)] })).success).toBe(false)
      expect(CandidateSchema.safeParse(candidate({ suiteNumbers: [longText(21)] })).success).toBe(false)
    })
  })
})

/** Distinct, ordered ISO days for index i (28 days a month, 12 months a year, from 1950). */
function isoDay(i: number): string {
  const day = String((i % 28) + 1).padStart(2, '0')
  const month = String(Math.floor(i / 28) % 12 + 1).padStart(2, '0')
  return `${1950 + Math.floor(i / (28 * 12))}-${month}-${day}`
}
