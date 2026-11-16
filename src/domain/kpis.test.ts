import { describe, it, expect } from 'vitest'
import { kpis } from './kpis'
import { BUNDLED_BUILDINGS } from '../data'
import { building, floor, lease, suite } from './testing/fixtures'

const TODAY = '2026-11-15'
const hero = BUNDLED_BUILDINGS[0]

// Expected values: spec.md A14 (never the DESIGN §6.1 sketch).
const ROWS = [
  {
    asOf: '2026-11-15', leasedSf: 96_650, occupancy: 71.7, vacantSf: 38_150, potentialSf: 0, committedSf: 3_000,
    expiringSf: 26_500, block: { floor: 7, suiteIds: ['odt-700', 'odt-710'], totalSf: 10_500 }, rentRoll: 4_913_650,
  },
  {
    asOf: '2027-05-01', leasedSf: 87_250, occupancy: 64.7, vacantSf: 47_550, potentialSf: 12_400, committedSf: 0,
    expiringSf: 23_400, block: { floor: 6, suiteIds: ['odt-600'], totalSf: 12_400 }, rentRoll: 4_486_450,
  },
  {
    asOf: '2027-07-01', leasedSf: 81_150, occupancy: 60.2, vacantSf: 53_650, potentialSf: 12_400, committedSf: 0,
    expiringSf: 25_200, block: { floor: 6, suiteIds: ['odt-600'], totalSf: 12_400 }, rentRoll: 4_218_050,
  },
] as const

describe('kpis for the hero building (A14)', () => {
  it.each(ROWS)('matches the A14 row at $asOf', (row) => {
    const k = kpis(hero, row.asOf, TODAY, true)
    expect(k.leasableSf).toBe(134_800)
    expect(k.leasedSf).toBe(row.leasedSf)
    expect(k.occupancyPct).not.toBeNull()
    expect(k.occupancyPct).toBeCloseTo(row.occupancy, 1)
    expect(k.vacantSf).toBe(row.vacantSf)
    expect(k.potentialSf).toBe(row.potentialSf)
    expect(k.committedSf).toBe(row.committedSf)
    expect(k.expiringSf).toBe(row.expiringSf)
    expect(k.largestBlock).toEqual(row.block)
    expect(k.rentRoll).toBe(row.rentRoll)
  })

  it('rounds occupancy to 72% for display at today', () => {
    expect(Math.round(kpis(hero, TODAY, TODAY, true).occupancyPct ?? -1)).toBe(72)
  })

  it('largest block follows the toggle: 10,500 SF on floor 7 at 2027-07-01 with it off', () => {
    const k = kpis(hero, '2027-07-01', TODAY, false)
    expect(k.largestBlock).toEqual({ floor: 7, suiteIds: ['odt-700', 'odt-710'], totalSf: 10_500 })
    expect(k.vacantSf).toBe(53_650)
    expect(k.potentialSf).toBe(12_400)
  })

  it('lists the suite ids behind each tile', () => {
    const k = kpis(hero, TODAY, TODAY, true)
    expect(k.ids.largestBlock).toEqual(['odt-700', 'odt-710'])
    expect(k.ids.expiring.slice().sort()).toEqual(['odt-1000', 'odt-220', 'odt-400', 'odt-600'])
    expect(k.ids.vacant.slice().sort()).toEqual(
      ['odt-1010', 'odt-300', 'odt-310', 'odt-410', 'odt-500', 'odt-700', 'odt-710'],
    )
    expect(k.ids.occupancy).toHaveLength(22)
  })
})

describe('kpis lease count and block suite numbers', () => {
  it('counts the expiring leases and names the largest block suites at today', () => {
    const k = kpis(hero, TODAY, TODAY, true)
    expect(k.expiringCount).toBe(4)
    expect(k.largestBlockSuiteNumbers).toEqual(['700', '710'])
  })

  it('follows the as-of date', () => {
    const k = kpis(hero, '2027-07-01', TODAY, true)
    expect(k.expiringCount).toBe(6) // 220, 1000 (2027), 200, 210, 1130, 800 (to 06/2028)
    expect(k.largestBlockSuiteNumbers).toEqual(['600'])
  })

  it('is 0 and empty for a building with no leasable space', () => {
    const k = kpis(building({ floors: [] }), TODAY, TODAY, true)
    expect(k.expiringCount).toBe(0)
    expect(k.largestBlockSuiteNumbers).toEqual([])
  })
})

describe('kpis edge cases', () => {
  it('an empty building gives occupancyPct === null', () => {
    const common = building({ floors: [floor({ suites: [suite({ kind: 'common', askingRentPsf: undefined, areaSf: 5000 })] })] })
    const k = kpis(common, TODAY, TODAY, true)
    expect(k.leasableSf).toBe(0)
    expect(k.occupancyPct).toBeNull()
    expect(k.largestBlock).toBeNull()
    expect(k.ids.largestBlock).toEqual([])
    expect(kpis(building({ floors: [] }), TODAY, TODAY, true).occupancyPct).toBeNull()
  })

  it('rent roll counts only leases active on D', () => {
    const b = building({
      floors: [floor({
        suites: [
          suite({ number: '100', areaSf: 1000, leases: [lease({ end: '2030-12-31', rentPsf: 50 })] }),
          suite({ number: '110', areaSf: 2000, leases: [lease({ start: '2027-01-01', end: '2031-12-31', rentPsf: 60 })] }),
          suite({ number: '120', areaSf: 3000, leases: [lease({ end: '2025-12-31', rentPsf: 70 })] }),
        ],
      })],
    })
    const k = kpis(b, TODAY, TODAY, true)
    expect(k.rentRoll).toBe(50_000)
    expect(k.vacantSf).toBe(5000)
    expect(k.committedSf).toBe(2000)
  })
})
