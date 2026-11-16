import { describe, it, expect } from 'vitest'
import spireRaw from './biscayne-spire.json'
import commonsRaw from './mangrove-commons.json'
import exchangeRaw from './flamingo-exchange.json'
import { BUNDLED_BUILDINGS } from '.'
import { BuildingSchema } from '../shared/domain.schema'
import { kpis } from '../domain/kpis'
import { findFits } from '../domain/findFits'
import { statusAt } from '../domain/status'
import type { Building, Floor, Lease } from '../domain/types'

const TODAY = '2026-11-15'
const spire = BuildingSchema.parse(spireRaw)
const commons = BuildingSchema.parse(commonsRaw)
const exchange = BuildingSchema.parse(exchangeRaw)

const plate = (f: Floor) => f.suites.reduce((sum, s) => sum + s.areaSf, 0)
const floorOf = (b: Building, n: number): Floor => {
  const f = b.floors.find((x) => x.number === n)
  if (!f) throw new Error(`no floor ${n}`)
  return f
}
const isActive = (l: Lease, d: string) => l.start <= d && (l.end === null || d <= l.end)
const statusKind = (b: Building, d: string) => new Set(
  b.floors.flatMap((f) => f.suites).filter((s) => s.kind === 'leasable').map((s) => {
    const st = statusAt(s, d, TODAY)
    return st.status === 'vacant' && st.overlay !== 'none' ? st.overlay : st.status
  }),
)

describe('bundled demo buildings', () => {
  it('appends the three new buildings after the first two', () => {
    expect(BUNDLED_BUILDINGS.map((b) => b.id)).toEqual(['odt', 'pbp', 'bsp', 'mgc', 'fex'])
    expect(BUNDLED_BUILDINGS.map((b) => b.name).slice(2)).toEqual(['Biscayne Spire', 'Mangrove Commons', 'Flamingo Exchange'])
  })

  it.each([spire, commons, exchange])('$name uses prefixed, unique ids and floor-based suite numbers', (b) => {
    const suites = b.floors.flatMap((f) => f.suites.map((s) => ({ s, floor: f.number })))
    for (const { s, floor } of suites) {
      expect(s.id).toBe(`${b.id}-${s.number}`)
      expect(s.number).toMatch(new RegExp(`^${floor}\\d{2}$`))
      s.leases.forEach((l, i) => expect(l.id).toBe(`${s.id}-l${i + 1}`))
    }
    expect(new Set(suites.map(({ s }) => s.id)).size).toBe(suites.length)
  })

  it.each([spire, commons, exchange])('$name shows occupied, expiring, vacant and committed space today', (b) => {
    for (const k of ['occupied', 'expiring', 'vacant', 'committed']) expect(statusKind(b, TODAY)).toContain(k)
  })
})

describe('Biscayne Spire (tall tower)', () => {
  it('has 30 floors that step back going up, with a lobby and a sky lobby', () => {
    expect(spire.floors.map((f) => f.number)).toEqual(Array.from({ length: 30 }, (_, i) => 30 - i))
    const plates = [...spire.floors].reverse().map(plate)
    plates.slice(1).forEach((p, i) => expect(p).toBeLessThanOrEqual(plates[i] ?? 0))
    expect(new Set(plates).size).toBeGreaterThanOrEqual(4) // three setbacks
    expect(floorOf(spire, 1).suites.some((s) => s.kind === 'common' && s.name === 'Lobby')).toBe(true)
    expect(floorOf(spire, 15).suites.every((s) => s.kind === 'common')).toBe(true)
  })

  it('has a full-floor anchor tenant over six consecutive floors', () => {
    const anchorFloors = spire.floors
      .filter((f) => f.suites.length === 1 && f.suites[0]?.leases.some((l) => l.tenant === 'Palmetto Harbor Bancorp' && isActive(l, TODAY)))
      .map((f) => f.number)
    expect(anchorFloors).toEqual([21, 20, 19, 18, 17, 16])
  })

  it('has many small suites on the low floors', () => {
    for (let n = 2; n <= 8; n++) {
      const f = floorOf(spire, n)
      expect(f.suites).toHaveLength(7)
      expect(f.suites.every((s) => s.areaSf <= 4500)).toBe(true)
    }
  })

  it('has the headline numbers on 2026-11-15', () => {
    const k = kpis(spire, TODAY, TODAY, false)
    expect(k.leasableSf).toBe(548_000)
    expect(k.occupancyPct?.toFixed(1)).toBe('77.3')
    expect(k.vacantSf).toBe(124_200)
    expect(k.largestBlock?.totalSf).toBe(16_000)
    expect(findFits(spire, { minSf: 10_000, includePotential: true }, TODAY, TODAY).length).toBeGreaterThan(0)
  })
})

describe('Mangrove Commons (wide mid-rise)', () => {
  it('has 8 floors of big plates with 8-10 suites each', () => {
    expect(commons.floors).toHaveLength(8)
    for (const f of commons.floors) {
      expect(f.suites.length).toBeGreaterThanOrEqual(8)
      expect(f.suites.length).toBeLessThanOrEqual(10)
      expect(plate(f)).toBeGreaterThanOrEqual(48_000)
    }
  })

  it('offers a 25,000+ SF contiguous option today', () => {
    const fits = findFits(commons, { minSf: 25_000, includePotential: false }, TODAY, TODAY)
    expect(fits[0]?.totalSf).toBeGreaterThanOrEqual(25_000)
    expect(fits[0]?.suiteIds.length).toBeGreaterThan(1)
    const k = kpis(commons, TODAY, TODAY, false)
    expect(k.largestBlock).toEqual({ floor: 5, suiteIds: ['mgc-501', 'mgc-502', 'mgc-503', 'mgc-504', 'mgc-505'], totalSf: 26_000 })
    expect(k.leasableSf).toBe(399_000)
    expect(k.occupancyPct?.toFixed(1)).toBe('72.0')
    expect(k.vacantSf).toBe(111_800)
  })
})

describe('Flamingo Exchange (mixed use)', () => {
  it('has 18 floors with retail and amenities at the base', () => {
    expect(exchange.floors).toHaveLength(18)
    for (const n of [1, 2]) {
      const f = floorOf(exchange, n)
      expect(f.suites.some((s) => s.kind === 'common')).toBe(true)
      expect(f.suites.some((s) => s.kind === 'leasable')).toBe(true)
    }
  })

  it('has a mostly vacant, newly delivered top section', () => {
    const top = exchange.floors.filter((f) => f.number >= 15)
    const suites = top.flatMap((f) => f.suites)
    const vacantSf = suites.filter((s) => statusAt(s, TODAY, TODAY).status === 'vacant').reduce((sum, s) => sum + s.areaSf, 0)
    expect(vacantSf / suites.reduce((sum, s) => sum + s.areaSf, 0)).toBeGreaterThan(0.75)
    expect(suites.flatMap((s) => s.leases).every((l) => l.start >= '2026-01-01')).toBe(true)
  })

  it('has a wave of leases ending in 2027 that empties the building by 2028', () => {
    const today = kpis(exchange, TODAY, TODAY, false)
    const leased = exchange.floors.flatMap((f) => f.suites).flatMap((s) => {
      const st = statusAt(s, TODAY, TODAY)
      return st.status === 'occupied' || st.status === 'expiring' ? [{ s, lease: st.lease }] : []
    })
    const ending2027 = leased.filter(({ lease }) => lease.end?.startsWith('2027')).reduce((sum, { s }) => sum + s.areaSf, 0)
    expect(ending2027 / today.leasedSf).toBeGreaterThan(0.4)
    const later = kpis(exchange, '2028-01-01', TODAY, false)
    expect((today.occupancyPct ?? 0) - (later.occupancyPct ?? 0)).toBeGreaterThan(20)
    expect(today.leasableSf).toBe(292_000)
    expect(today.occupancyPct?.toFixed(1)).toBe('68.0')
    expect(today.vacantSf).toBe(93_500)
    expect(today.largestBlock?.totalSf).toBe(18_000)
  })
})
