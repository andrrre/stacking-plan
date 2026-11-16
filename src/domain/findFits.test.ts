import { describe, it, expect } from 'vitest'
import { findFits, suiteCandidate } from './findFits'
import { BUNDLED_BUILDINGS } from '../data'
import { building, floor, lease, suite } from './testing/fixtures'
import type { Candidate, Requirement } from './types'

const TODAY = '2026-11-15'
const JUL_2027 = '2027-07-01'
const hero = BUNDLED_BUILDINGS[0]

const req = (over: Partial<Requirement> = {}): Requirement => ({ minSf: 10_000, includePotential: true, ...over })
const numbers = (cs: readonly Candidate[]) => cs.map((c) => c.suiteNumbers.join('+'))

// Expected values: spec.md A14.
describe('findFits on the hero building (A14)', () => {
  it('min 10,000 today → 500, then 700+710', () => {
    const [first, second, ...rest] = findFits(hero, req(), TODAY, TODAY)
    expect(rest).toEqual([])
    expect(first).toEqual({
      key: 'odt-500', suiteIds: ['odt-500'], suiteNumbers: ['500'], floor: 5, totalSf: 10_250, excessSf: 250,
      blendedRentPsf: 48, availableFrom: TODAY, availability: 'now', caveats: [],
    })
    expect(second).toMatchObject({
      key: 'odt-700+odt-710', suiteIds: ['odt-700', 'odt-710'], suiteNumbers: ['700', '710'], floor: 7,
      totalSf: 10_500, excessSf: 500, availableFrom: TODAY, availability: 'now', caveats: [{ kind: 'combine', count: 2 }],
    })
    expect(second?.blendedRentPsf).toBeCloseTo(52.18, 2)
    expect(second?.blendedRentPsf.toFixed(2)).toBe('52.18')
  })

  it('min 10,000 at 2027-07-01 → 400+410 (firm), 500, 700+710, 600 (potential)', () => {
    const fits = findFits(hero, req(), JUL_2027, TODAY)
    expect(numbers(fits)).toEqual(['400+410', '500', '700+710', '600'])
    expect(fits[0]).toMatchObject({ totalSf: 10_100, excessSf: 100, availability: 'now', availableFrom: '2027-06-01' })
    expect(fits[3]).toMatchObject({
      totalSf: 12_400, excessSf: 2_400, availability: 'potential', availableFrom: '2027-05-01',
      caveats: [{ kind: 'assumesNoRenewal', tenant: 'Flamingo Row Media', leaseEnd: '2027-04-30' }],
    })
  })

  it('never returns 300 or 310 (the core wall breaks the run)', () => {
    // 300 + 310 would make 10,400 SF if the wall between them could be removed.
    const all = [TODAY, JUL_2027].flatMap((d) => [10_000, 10_400].flatMap((minSf) => findFits(hero, req({ minSf }), d, TODAY)))
    expect(all.flatMap((c) => c.suiteNumbers).filter((n) => n === '300' || n === '310')).toEqual([])
    expect(numbers(findFits(hero, req({ minSf: 10_400 }), TODAY, TODAY))).toEqual(['700+710'])
  })

  it('max 10,300 → [500]', () => {
    expect(numbers(findFits(hero, req({ maxSf: 10_300 }), TODAY, TODAY))).toEqual(['500'])
  })

  it('max rent 50 → [500] (52.18 blended is over)', () => {
    expect(numbers(findFits(hero, req({ maxRentPsf: 50 }), TODAY, TODAY))).toEqual(['500'])
  })

  it('compares the unrounded blended rent with the max rent', () => {
    // 700+710 blends to 52.1809…, which rounds to 52.18 for display but is over 52.18.
    expect(numbers(findFits(hero, req({ maxRentPsf: 52.18 }), TODAY, TODAY))).toEqual(['500'])
    expect(numbers(findFits(hero, req({ maxRentPsf: 52.19 }), TODAY, TODAY))).toEqual(['500', '700+710'])
  })

  it('with the toggle off, 600 is excluded at 2027-07-01', () => {
    expect(numbers(findFits(hero, req({ includePotential: false }), JUL_2027, TODAY))).toEqual(['400+410', '500', '700+710'])
  })

  it('committed 1010 is never returned', () => {
    const all = [TODAY, '2027-01-01', '2027-02-01', JUL_2027].flatMap((d) => findFits(hero, req({ minSf: 1_000 }), d, TODAY))
    expect(all.some((c) => c.suiteIds.includes('odt-1010'))).toBe(false)
  })
})

const vacant = (number: string, areaSf: number, over: Parameters<typeof suite>[0] = {}) =>
  suite({ id: `s-${number}`, number, areaSf, joinsNext: true, ...over })

describe('findFits rules (fixtures)', () => {
  it('drops a run whose left end can go and still meet the minimum', () => {
    const b = building({ floors: [floor({ number: 1, suites: [vacant('101', 1_000), vacant('102', 6_000), vacant('103', 5_000)] })] })
    expect(numbers(findFits(b, req(), TODAY, TODAY))).toEqual(['102+103'])
  })

  it('returns overlapping minimal runs', () => {
    const b = building({ floors: [floor({ number: 1, suites: [vacant('101', 6_000), vacant('102', 5_000), vacant('103', 6_000)] })] })
    expect(numbers(findFits(b, req(), TODAY, TODAY))).toEqual(['101+102', '102+103'])
  })

  it('a single suite at or over the minimum is always minimal', () => {
    const b = building({ floors: [floor({ number: 1, suites: [vacant('101', 12_000), vacant('102', 500, { joinsNext: false })] })] })
    expect(numbers(findFits(b, req(), TODAY, TODAY))).toEqual(['101'])
  })

  it('a run breaks at the left suite’s joinsNext = false', () => {
    const b = building({ floors: [floor({ number: 1, suites: [vacant('101', 6_000, { joinsNext: false }), vacant('102', 6_000)] })] })
    expect(findFits(b, req(), TODAY, TODAY)).toEqual([])
  })

  it('a run breaks at an occupied suite, and common space never counts', () => {
    const occupied = vacant('102', 100, { leases: [lease({ start: '2025-01-01', end: '2030-12-31' })] })
    const common = vacant('104', 100, { kind: 'common', askingRentPsf: undefined, name: 'Lobby' })
    const b = building({ floors: [floor({ number: 1, suites: [vacant('101', 6_000), occupied, vacant('103', 6_000), common, vacant('105', 6_000)] })] })
    expect(findFits(b, req(), TODAY, TODAY)).toEqual([])
  })

  it('caps at 5 and ranks by excess, then fewer suites, higher floor, leftmost position', () => {
    const b = building({
      floors: [
        floor({ number: 1, suites: [vacant('101', 10_000, { joinsNext: false }), vacant('102', 10_400, { joinsNext: false })] }),
        floor({ number: 2, suites: [vacant('201', 10_000, { joinsNext: false }), vacant('202', 5_000), vacant('203', 5_100, { joinsNext: false })] }),
        floor({ number: 3, suites: [vacant('301', 10_100, { joinsNext: false }), vacant('302', 10_000, { joinsNext: false })] }),
      ],
    })
    // excess 0: 302 (fl 3), 201 (fl 2, pos 0), 101 (fl 1) · excess 100: 301 (1 suite) before 202+203 (2 suites) · 102 cut.
    expect(numbers(findFits(b, req(), TODAY, TODAY))).toEqual(['302', '201', '101', '301', '202+203'])
  })

  it('ranks firm before potential, even with more excess', () => {
    const ending = lease({ tenant: 'Leaver', start: '2020-01-01', end: '2027-01-31' })
    const b = building({
      floors: [floor({ number: 1, suites: [
        vacant('101', 10_000, { joinsNext: false, leases: [ending] }), vacant('102', 15_000, { joinsNext: false }),
      ] })],
    })
    const fits = findFits(b, req(), '2027-03-01', TODAY)
    expect(numbers(fits)).toEqual(['102', '101'])
    expect(fits.map((c) => c.availability)).toEqual(['now', 'potential'])
    expect(fits[1]?.availableFrom).toBe('2027-02-01')
  })

  it('caveats: combine first, then one assumesNoRenewal per potential suite by lease end', () => {
    const b = building({
      floors: [floor({ number: 1, suites: [
        vacant('101', 4_000, { leases: [lease({ tenant: 'Late', start: '2020-01-01', end: '2027-04-30' })] }),
        vacant('102', 3_000),
        vacant('103', 4_000, { joinsNext: false, leases: [lease({ tenant: 'Early', start: '2020-01-01', end: '2027-02-28' })] }),
      ] })],
    })
    const [fit] = findFits(b, req(), '2027-06-01', TODAY)
    expect(fit?.availability).toBe('potential')
    expect(fit?.availableFrom).toBe('2027-05-01')
    expect(fit?.caveats).toEqual([
      { kind: 'combine', count: 3 },
      { kind: 'assumesNoRenewal', tenant: 'Early', leaseEnd: '2027-02-28' },
      { kind: 'assumesNoRenewal', tenant: 'Late', leaseEnd: '2027-04-30' },
    ])
  })

  it('returns nothing for an empty building or when nothing is big enough', () => {
    expect(findFits(building({ floors: [] }), req(), TODAY, TODAY)).toEqual([])
    expect(findFits(hero, req({ minSf: 60_000 }), TODAY, TODAY)).toEqual([])
  })
})

describe('suiteCandidate (one suite added to the client summary from its details)', () => {
  const on = (n: number) => hero.floors.find((f) => f.number === n) as (typeof hero.floors)[number]
  const find = (n: number, num: string) => on(n).suites.find((s) => s.number === num) as (typeof hero.floors)[number]['suites'][number]

  it('a vacant suite is a firm one-suite candidate, as the finder would give it', () => {
    const c = suiteCandidate(on(5), find(5, '500'), TODAY, TODAY, true)
    expect(c).toEqual(findFits(hero, req({ minSf: 10_250, maxSf: 10_250 }), TODAY, TODAY)[0])
    expect(c).toMatchObject({ key: 'odt-500', suiteNumbers: ['500'], floor: 5, totalSf: 10_250, excessSf: 0, availability: 'now' })
  })

  it('a potential suite carries its no-renewal caveat', () => {
    const c = suiteCandidate(on(6), find(6, '600'), JUL_2027, TODAY, true)
    expect(c).toMatchObject({ availability: 'potential', caveats: [{ kind: 'assumesNoRenewal', tenant: 'Flamingo Row Media' }] })
  })

  it('follows Include potential: with it off a potential suite is not a candidate, a vacant one still is', () => {
    expect(suiteCandidate(on(6), find(6, '600'), JUL_2027, TODAY, false)).toBeNull()
    expect(suiteCandidate(on(5), find(5, '500'), TODAY, TODAY, false)).toMatchObject({ key: 'odt-500', availability: 'now' })
  })

  it('occupied, committed and common space is not a candidate', () => {
    expect(suiteCandidate(on(9), find(9, '900'), TODAY, TODAY, true)).toBeNull()
    expect(suiteCandidate(on(10), find(10, '1010'), TODAY, TODAY, true)).toBeNull()
    expect(suiteCandidate(on(1), find(1, '100'), TODAY, TODAY, true)).toBeNull()
  })
})
