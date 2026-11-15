import { describe, it, expect } from 'vitest'
import { explainNoFit } from './explainNoFit'
import { BUNDLED_BUILDINGS } from '../data'
import { building, floor, lease, suite } from './testing/fixtures'
import type { Requirement } from './types'

const TODAY = '2026-11-15'
const hero = BUNDLED_BUILDINGS[0]

const req = (over: Partial<Requirement> = {}): Requirement => ({ minSf: 12_000, includePotential: true, ...over })

// Expected values: spec.md A14 and spec-technical §5.4.
describe('explainNoFit on the hero building', () => {
  it('min 12,000 today: largest block, spread, earliest fit May 2027 on potential Suite 600', () => {
    const result = explainNoFit(hero, req(), TODAY, TODAY)
    expect(result.reasons).toEqual([
      { kind: 'largestBlock', block: { floor: 7, suiteIds: ['odt-700', 'odt-710'], totalSf: 10_500 } },
      { kind: 'spread', totalSf: 35_150, floorCount: 4, blockCount: 5 },
    ])
    expect(result.earliestFit?.date).toBe('2027-05-01')
    expect(result.earliestFit?.candidate).toMatchObject({ key: 'odt-600', suiteNumbers: ['600'], availability: 'potential' })
  })

  it('min 60,000: the largest block only, and no fit in the horizon', () => {
    const result = explainNoFit(hero, req({ minSf: 60_000 }), TODAY, TODAY)
    expect(result.reasons).toEqual([
      { kind: 'largestBlock', block: { floor: 7, suiteIds: ['odt-700', 'odt-710'], totalSf: 10_500 } },
    ])
    expect(result.earliestFit).toBeNull()
  })
})

describe('explainNoFit reasons (fixtures)', () => {
  const pricey = building({
    floors: [floor({ number: 2, suites: [suite({ id: 's-200', number: '200', areaSf: 2000, askingRentPsf: 80 })] })],
  })

  it('nothingAvailable when no suite is available on D', () => {
    const full = building({
      floors: [floor({ suites: [suite({ leases: [lease({ start: '2020-01-01', end: null })] })] })],
    })
    const result = explainNoFit(full, req({ minSf: 500 }), TODAY, TODAY)
    expect(result.reasons).toEqual([{ kind: 'nothingAvailable' }])
    expect(result.earliestFit).toBeNull()
  })

  it('filtered by maxSf when lifting the maximum size gives a fit', () => {
    const result = explainNoFit(pricey, req({ minSf: 1000, maxSf: 1500 }), TODAY, TODAY)
    expect(result.reasons).toContainEqual({ kind: 'filtered', by: ['maxSf'] })
  })

  it('filtered by maxRentPsf when lifting the maximum rent gives a fit', () => {
    const result = explainNoFit(pricey, req({ minSf: 1000, maxRentPsf: 50 }), TODAY, TODAY)
    expect(result.reasons).toContainEqual({ kind: 'filtered', by: ['maxRentPsf'] })
  })

  it('filtered by both when only lifting both limits gives a fit', () => {
    const result = explainNoFit(pricey, req({ minSf: 1000, maxSf: 1500, maxRentPsf: 50 }), TODAY, TODAY)
    expect(result.reasons).toContainEqual({ kind: 'filtered', by: ['maxSf', 'maxRentPsf'] })
  })

  it('no filtered reason when the limits are not what blocks a fit', () => {
    const result = explainNoFit(pricey, req({ minSf: 5000, maxSf: 9000 }), TODAY, TODAY)
    expect(result.reasons.map((r) => r.kind)).toEqual(['largestBlock'])
  })

  it('no spread reason when the total available is below the minimum', () => {
    const result = explainNoFit(pricey, req({ minSf: 2500 }), TODAY, TODAY)
    expect(result.reasons.map((r) => r.kind)).toEqual(['largestBlock'])
  })

  it('spread names a single floor in the singular count', () => {
    const split = building({
      floors: [floor({ number: 3, suites: [
        suite({ id: 's-300', number: '300', areaSf: 1000 }),
        suite({ id: 's-310', number: '310', areaSf: 1000, leases: [lease({ start: '2020-01-01', end: null })] }),
        suite({ id: 's-320', number: '320', areaSf: 1000 }),
      ] })],
    })
    const result = explainNoFit(split, req({ minSf: 1500 }), TODAY, TODAY)
    expect(result.reasons).toContainEqual({ kind: 'spread', totalSf: 2000, floorCount: 1, blockCount: 2 })
  })
})

describe('explainNoFit earliest-fit scan', () => {
  // 1,000 SF whose lease ends 31 Jan 2027 (not vacating): potential from 1 Feb 2027.
  const ending = building({
    floors: [floor({ suites: [suite({ id: 's-100', areaSf: 1000, leases: [lease({ start: '2020-01-01', end: '2027-01-31' })] })] })],
  })
  const D = '2027-03-01'

  it('toggle on: the scan starts the step after D', () => {
    const result = explainNoFit(ending, req({ minSf: 1000 }), D, TODAY)
    expect(result.earliestFit?.date).toBe('2027-04-01')
  })

  it('toggle off: the scan starts at D itself and always counts potential space', () => {
    const result = explainNoFit(ending, req({ minSf: 1000, includePotential: false }), D, TODAY)
    expect(result.reasons).toEqual([{ kind: 'nothingAvailable' }])
    expect(result.earliestFit?.date).toBe(D)
    expect(result.earliestFit?.candidate).toMatchObject({ key: 's-100', availability: 'potential' })
  })

  it('the scan keeps the max size and rent limits', () => {
    const big = building({
      floors: [floor({ suites: [suite({ id: 's-100', areaSf: 3000, leases: [lease({ start: '2020-01-01', end: '2027-01-31' })] })] })],
    })
    expect(explainNoFit(big, req({ minSf: 1000, maxSf: 2000 }), TODAY, TODAY).earliestFit).toBeNull()
  })

  it('at the last slider step with the toggle on, there is nothing left to scan', () => {
    const result = explainNoFit(ending, req({ minSf: 1000 }), '2031-11-01', TODAY)
    expect(result.earliestFit).toBeNull()
  })
})
