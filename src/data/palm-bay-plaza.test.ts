import { describe, it, expect } from 'vitest'
import raw from './palm-bay-plaza.json'
import { BUNDLED_BUILDINGS } from '.'
import { BuildingSchema } from '../shared/domain.schema'
import { findFits } from '../domain/findFits'
import { statusAt } from '../domain/status'

const TODAY = '2026-11-15'
const pbp = BuildingSchema.parse(raw)
const suites = pbp.floors.flatMap((f) => f.suites)

describe('Palm Bay Plaza', () => {
  it('is schema-valid and bundled second', () => {
    expect(BUNDLED_BUILDINGS).toHaveLength(2)
    expect(BUNDLED_BUILDINGS[1]?.id).toBe('pbp')
    expect(pbp.name).toBe('Palm Bay Plaza')
  })

  it('has 7 floors: 1-3 at 18,000 SF, 4-7 at 8,000 SF', () => {
    expect(pbp.floors.map((f) => f.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7])
    for (const f of pbp.floors) {
      const total = f.suites.reduce((a, s) => a + s.areaSf, 0)
      expect(total).toBe(f.number <= 3 ? 18000 : 8000)
    }
  })

  it('has about 25 suites, mostly 1,000-3,000 SF', () => {
    const leasable = suites.filter((s) => s.kind === 'leasable')
    expect(suites.length).toBeGreaterThanOrEqual(24)
    expect(suites.length).toBeLessThanOrEqual(30)
    const typical = leasable.filter((s) => s.areaSf >= 1000 && s.areaSf <= 3000)
    expect(typical.length / leasable.length).toBeGreaterThan(0.5)
  })

  it('has a common lobby on floor 1', () => {
    const floor1 = pbp.floors.find((f) => f.number === 1)
    expect(floor1?.suites.some((s) => s.kind === 'common')).toBe(true)
  })

  it('uses pbp-prefixed suite and lease ids', () => {
    for (const s of suites) {
      expect(s.id).toBe(`pbp-${s.number}`)
      s.leases.forEach((l, i) => expect(l.id).toBe(`${s.id}-l${i + 1}`))
    }
  })

  it('populates every status on 2026-11-15', () => {
    const statuses = suites.filter((s) => s.kind === 'leasable').map((s) => statusAt(s, TODAY, TODAY))
    const kinds = new Set(statuses.map((st) => (st.status === 'vacant' ? (st.overlay === 'none' ? 'vacant' : st.overlay) : st.status)))
    for (const k of ['occupied', 'expiring', 'vacant', 'committed']) expect(kinds).toContain(k)
  })

  it('min 10,000 returns a 3-suite candidate', () => {
    const fits = findFits(pbp, { minSf: 10000, includePotential: true }, TODAY, TODAY)
    expect(fits.some((c) => c.suiteIds.length === 3)).toBe(true)
  })
})
