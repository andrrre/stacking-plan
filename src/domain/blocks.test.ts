import { describe, it, expect } from 'vitest'
import { largestBlock, maximalRuns } from './blocks'
import { building, floor, lease, suite } from './testing/fixtures'

const TODAY = '2026-11-15'
const occupied = () => [lease({ end: '2031-12-31' })]

describe('maximalRuns', () => {
  it('splits a run at a joinsNext=false boundary', () => {
    const f = floor({
      number: 3,
      suites: [
        suite({ number: '300', areaSf: 5600, joinsNext: false }),
        suite({ number: '310', areaSf: 4800, joinsNext: true }),
        suite({ number: '320', areaSf: 1200 }),
      ],
    })
    expect(maximalRuns(f, TODAY, TODAY, true)).toEqual([
      { floor: 3, suiteIds: ['s-300'], totalSf: 5600 },
      { floor: 3, suiteIds: ['s-310', 's-320'], totalSf: 6000 },
    ])
  })

  it('splits a run at an unavailable suite', () => {
    const f = floor({
      number: 2,
      suites: [
        suite({ number: '200', areaSf: 1000, joinsNext: true }),
        suite({ number: '210', areaSf: 2000, joinsNext: true, leases: occupied() }),
        suite({ number: '220', areaSf: 3000, joinsNext: true }),
        suite({ number: '230', areaSf: 4000 }),
      ],
    })
    expect(maximalRuns(f, TODAY, TODAY, true)).toEqual([
      { floor: 2, suiteIds: ['s-200'], totalSf: 1000 },
      { floor: 2, suiteIds: ['s-220', 's-230'], totalSf: 7000 },
    ])
  })

  it('excludes potential suites when the toggle is off', () => {
    const f = floor({
      number: 6,
      suites: [
        suite({ number: '600', areaSf: 5000, joinsNext: true, leases: [lease({ end: '2027-04-30' })] }),
        suite({ number: '610', areaSf: 1000 }),
      ],
    })
    expect(maximalRuns(f, '2027-07-01', TODAY, true)).toEqual([{ floor: 6, suiteIds: ['s-600', 's-610'], totalSf: 6000 }])
    expect(maximalRuns(f, '2027-07-01', TODAY, false)).toEqual([{ floor: 6, suiteIds: ['s-610'], totalSf: 1000 }])
  })

  it('returns nothing for a fully let floor', () => {
    expect(maximalRuns(floor({ suites: [suite({ leases: occupied() })] }), TODAY, TODAY, true)).toEqual([])
  })
})

describe('largestBlock', () => {
  it('gives ties to the higher floor', () => {
    const b = building({
      floors: [
        floor({ number: 4, suites: [suite({ number: '400', areaSf: 5000 })] }),
        floor({ number: 7, suites: [suite({ number: '700', areaSf: 5000 })] }),
        floor({ number: 2, suites: [suite({ number: '200', areaSf: 4000 })] }),
      ],
    })
    expect(largestBlock(b, TODAY, TODAY, true)).toEqual({ floor: 7, suiteIds: ['s-700'], totalSf: 5000 })
  })

  it('gives ties on one floor to the first run', () => {
    const b = building({
      floors: [floor({
        number: 5,
        suites: [
          suite({ number: '500', areaSf: 3000 }),
          suite({ number: '510', areaSf: 3000 }),
        ],
      })],
    })
    expect(largestBlock(b, TODAY, TODAY, true)?.suiteIds).toEqual(['s-500'])
  })

  it('picks the largest total across floors', () => {
    const b = building({
      floors: [
        floor({ number: 9, suites: [suite({ number: '900', areaSf: 2000 })] }),
        floor({
          number: 3,
          suites: [suite({ number: '300', areaSf: 2000, joinsNext: true }), suite({ number: '310', areaSf: 1000 })],
        }),
      ],
    })
    expect(largestBlock(b, TODAY, TODAY, true)).toEqual({ floor: 3, suiteIds: ['s-300', 's-310'], totalSf: 3000 })
  })

  it('is null when nothing is available', () => {
    const b = building({ floors: [floor({ suites: [suite({ leases: occupied() })] })] })
    expect(largestBlock(b, TODAY, TODAY, true)).toBeNull()
  })
})
