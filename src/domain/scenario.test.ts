import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../data'
import { BuildingSchema } from '../shared/domain.schema'
import { kpis } from './kpis'
import { applyScenario, findLease, modifiedSuiteIds } from './scenario'
import { statusAt } from './status'
import type { Building, Change, Suite } from './types'

const TODAY = '2026-11-15'

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

const pristine: Building = structuredClone(BUNDLED_BUILDINGS[0])
const hero: Building = deepFreeze(structuredClone(BUNDLED_BUILDINGS[0]))

function applied(changes: Change[]): Building {
  const r = applyScenario(hero, changes)
  if (!r.ok) throw new Error(`scenario failed: ${r.error.message}`)
  return r.building
}

function suiteOf(b: Building, id: string): Suite {
  const s = b.floors.flatMap((f) => f.suites).find((x) => x.id === id)
  if (!s) throw new Error(`no suite ${id}`)
  return s
}

const prospect = (suiteIds: string[], start = TODAY, end = '2031-11-14'): Change =>
  ({ kind: 'newLease', suiteIds, tenant: 'Prospect', start, end, rentPsf: 48 })

describe('findLease', () => {
  it('locates a lease with its suite and floor', () => {
    const loc = findLease(hero, 'odt-600-l1')
    expect(loc?.floor).toBe(6)
    expect(loc?.suite.id).toBe('odt-600')
    expect(loc?.lease.tenant).toBe('Flamingo Row Media')
  })

  it('returns null for an unknown id', () => {
    expect(findLease(hero, 'nope')).toBeNull()
    expect(findLease(hero, '')).toBeNull()
  })
})

describe('applyScenario', () => {
  it('no changes returns the base building itself', () => {
    const r = applyScenario(hero, [])
    expect(r.ok && r.building).toBe(hero)
  })

  describe('renew', () => {
    it('600 to 2032-04-30 succeeds', () => {
      const lease = findLease(applied([{ kind: 'renew', leaseId: 'odt-600-l1', newEnd: '2032-04-30' }]), 'odt-600-l1')?.lease
      expect(lease?.end).toBe('2032-04-30')
      expect(lease?.vacating).toBe(false)
    })

    it('clears vacating (400 is on notice)', () => {
      const lease = findLease(applied([{ kind: 'renew', leaseId: 'odt-400-l1', newEnd: '2030-05-31' }]), 'odt-400-l1')?.lease
      expect(findLease(hero, 'odt-400-l1')?.lease.vacating).toBe(true)
      expect(lease?.vacating).toBe(false)
      expect(lease?.end).toBe('2030-05-31')
    })

    it('to an earlier or equal date fails with invalidDates', () => {
      for (const newEnd of ['2027-01-31', '2027-04-30']) {
        const r = applyScenario(hero, [{ kind: 'renew', leaseId: 'odt-600-l1', newEnd }])
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error.code).toBe('invalidDates')
      }
    })

    it('the open-ended 230 cannot be renewed', () => {
      const r = applyScenario(hero, [{ kind: 'renew', leaseId: 'odt-230-l1', newEnd: '2040-01-01' }])
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('invalidDates')
    })

    it('an unknown lease fails with leaseNotFound', () => {
      const r = applyScenario(hero, [{ kind: 'renew', leaseId: 'odt-999-l1', newEnd: '2040-01-01' }])
      expect(!r.ok && r.error.code).toBe('leaseNotFound')
    })

    it('fails with overlap when the new end runs into a later lease', () => {
      const r = applyScenario(hero, [
        prospect(['odt-600'], '2027-05-01', '2028-04-30'),
        { kind: 'renew', leaseId: 'odt-600-l1', newEnd: '2027-12-31' },
      ])
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error.code).toBe('overlap')
        expect(r.error.index).toBe(1)
        expect(r.error.message).toContain('Prospect')
      }
    })
  })

  describe('vacate', () => {
    it('ends the lease on the date and marks it vacating', () => {
      const lease = findLease(applied([{ kind: 'vacate', leaseId: 'odt-900-l1', on: '2027-06-30' }]), 'odt-900-l1')?.lease
      expect(lease).toMatchObject({ end: '2027-06-30', vacating: true })
    })

    it('accepts the lease start and end as bounds', () => {
      expect(applyScenario(hero, [{ kind: 'vacate', leaseId: 'odt-600-l1', on: '2017-05-01' }]).ok).toBe(true)
      expect(applyScenario(hero, [{ kind: 'vacate', leaseId: 'odt-600-l1', on: '2027-04-30' }]).ok).toBe(true)
    })

    it('rejects a date before the start or after the end', () => {
      for (const on of ['2017-04-30', '2027-05-01']) {
        const r = applyScenario(hero, [{ kind: 'vacate', leaseId: 'odt-600-l1', on }])
        expect(!r.ok && r.error.code).toBe('invalidDates')
      }
    })

    it('an open-ended lease takes any date from its start', () => {
      expect(applyScenario(hero, [{ kind: 'vacate', leaseId: 'odt-230-l1', on: '2035-01-01' }]).ok).toBe(true)
      const r = applyScenario(hero, [{ kind: 'vacate', leaseId: 'odt-230-l1', on: '2018-12-31' }])
      expect(!r.ok && r.error.code).toBe('invalidDates')
    })

    it('vacating 600 on its end makes it plain vacant after the end', () => {
      const b = applied([{ kind: 'vacate', leaseId: 'odt-600-l1', on: '2027-04-30' }])
      const st = statusAt(suiteOf(b, 'odt-600'), '2027-07-01', TODAY)
      expect(st).toMatchObject({ status: 'vacant', overlay: 'none' })
    })
  })

  describe('newLease', () => {
    it('on 500 creates id scn-0-odt-500 (C2)', () => {
      const leases = suiteOf(applied([prospect(['odt-500'])]), 'odt-500').leases
      expect(leases.map((l) => l.id)).toEqual(['odt-500-l1', 'scn-0-odt-500'])
      expect(leases[1]).toEqual({ id: 'scn-0-odt-500', tenant: 'Prospect', start: TODAY, end: '2031-11-14', rentPsf: 48 })
    })

    it('the change index goes into the id', () => {
      const b = applied([{ kind: 'renew', leaseId: 'odt-600-l1', newEnd: '2032-04-30' }, prospect(['odt-500'])])
      expect(suiteOf(b, 'odt-500').leases.map((l) => l.id)).toContain('scn-1-odt-500')
    })

    it('placing a tenant on 500 at today: occupancy 72% → 79%, rent roll +$492,000', () => {
      const before = kpis(hero, TODAY, TODAY, true)
      const after = kpis(applied([prospect(['odt-500'])]), TODAY, TODAY, true)
      expect(Math.round(before.occupancyPct ?? 0)).toBe(72)
      expect(Math.round(after.occupancyPct ?? 0)).toBe(79)
      expect(after.rentRoll - before.rentRoll).toBe(492_000)
      expect(after.vacantSf).toBe(38_150 - 10_250)
    })

    it('on 1010 from 2027-01-01 fails with overlap and a message', () => {
      const r = applyScenario(hero, [prospect(['odt-1010'], '2027-01-01', '2031-12-31')])
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error.code).toBe('overlap')
        expect(r.error.index).toBe(0)
        expect(r.error.message).toBe('Suite 1010 is leased to Bayfront Dental Group 1 Mar 2027 – 29 Feb 2032.')
      }
    })

    it('overlap is inclusive: starting on the last day of a lease is rejected', () => {
      const r = applyScenario(hero, [prospect(['odt-600'], '2027-04-30', '2030-01-01')])
      expect(!r.ok && r.error.code).toBe('overlap')
      expect(applyScenario(hero, [prospect(['odt-600'], '2027-05-01', '2030-01-01')]).ok).toBe(true)
    })

    it('an open-ended lease overlaps every later start', () => {
      const r = applyScenario(hero, [prospect(['odt-230'], '2045-01-01', '2050-01-01')])
      expect(!r.ok && r.error.code).toBe('overlap')
    })

    it('a multi-suite lease on 700+710 adds one lease per suite', () => {
      const b = applied([prospect(['odt-700', 'odt-710'])])
      expect(suiteOf(b, 'odt-700').leases.map((l) => l.id)).toEqual(['odt-700-l1', 'scn-0-odt-700'])
      expect(suiteOf(b, 'odt-710').leases.map((l) => l.id)).toEqual(['scn-0-odt-710'])
      expect(statusAt(suiteOf(b, 'odt-710'), TODAY, TODAY).status).toBe('occupied')
    })

    it('one overlapping suite rejects the whole change', () => {
      const r = applyScenario(hero, [prospect(['odt-1000', 'odt-1010'], '2027-12-01', '2028-12-31')])
      expect(!r.ok && r.error.code).toBe('overlap')
    })

    it.each([
      [['odt-410', 'odt-300'], 'Suites 410 and 300 cannot be combined.'],
      [['odt-700', 'odt-720'], 'Suites 700 and 720 cannot be combined.'],
      [['odt-300', 'odt-310'], 'Suites 300 and 310 cannot be combined.'],
      [['odt-500', 'odt-500'], 'Suite 500 is listed twice.'],
    ])('suites %j that cannot form one lease are rejected', (suiteIds, message) => {
      expect(applyScenario(hero, [prospect(suiteIds)])).toEqual({ ok: false, error: { index: 0, code: 'notLeasable', message } })
    })

    it('combinable suites in either order and a single suite still work', () => {
      expect(applyScenario(hero, [prospect(['odt-700', 'odt-710'])]).ok).toBe(true)
      expect(applyScenario(hero, [prospect(['odt-710', 'odt-700'])]).ok).toBe(true)
      expect(applyScenario(hero, [prospect(['odt-410'])]).ok).toBe(true)
    })

    it('rejects end before start, unknown and common suites', () => {
      expect(applyScenario(hero, [prospect(['odt-500'], '2027-01-01', '2026-12-31')]))
        .toMatchObject({ ok: false, error: { code: 'invalidDates', index: 0 } })
      expect(applyScenario(hero, [prospect(['odt-999'])])).toMatchObject({ ok: false, error: { code: 'suiteNotFound' } })
      expect(applyScenario(hero, [prospect(['odt-100'])])).toMatchObject({ ok: false, error: { code: 'notLeasable' } })
    })

    it('leases stay sorted by start and the result passes the building schema', () => {
      const b = applied([prospect(['odt-1010'], '2026-11-15', '2027-02-28')])
      expect(suiteOf(b, 'odt-1010').leases.map((l) => l.start)).toEqual(['2026-11-15', '2027-03-01'])
      expect(BuildingSchema.safeParse(b).success).toBe(true)
    })
  })

  it('errors carry the index of the failing change', () => {
    const r = applyScenario(hero, [
      prospect(['odt-500']),
      { kind: 'renew', leaseId: 'odt-600-l1', newEnd: '2032-04-30' },
      prospect(['odt-500'], '2028-01-01', '2029-01-01'),
    ])
    expect(r).toMatchObject({ ok: false, error: { index: 2, code: 'overlap' } })
  })

  it('a later change can act on a scenario lease', () => {
    const b = applied([prospect(['odt-500']), { kind: 'vacate', leaseId: 'scn-0-odt-500', on: '2028-12-31' }])
    expect(findLease(b, 'scn-0-odt-500')?.lease).toMatchObject({ end: '2028-12-31', vacating: true })
  })

  it('copies only along the changed path and never mutates the base', () => {
    const b = applied([prospect(['odt-500']), { kind: 'vacate', leaseId: 'odt-900-l1', on: '2027-06-30' }])
    expect(hero).toEqual(pristine)
    expect(b).not.toBe(hero)
    const floor = (bb: Building, n: number) => bb.floors.find((f) => f.number === n)
    expect(floor(b, 12)).toBe(floor(hero, 12))
    expect(floor(b, 5)).not.toBe(floor(hero, 5))
    expect(suiteOf(b, 'odt-510')).toBe(suiteOf(hero, 'odt-510'))
    expect(suiteOf(b, 'odt-500')).not.toBe(suiteOf(hero, 'odt-500'))
    expect(suiteOf(b, 'odt-500').leases[0]).toBe(suiteOf(hero, 'odt-500').leases[0])
  })
})

describe('modifiedSuiteIds', () => {
  it('is empty with no changes', () => {
    expect(modifiedSuiteIds(hero, []).size).toBe(0)
  })

  it('collects the suites each change touches, including leases created by the scenario', () => {
    const ids = modifiedSuiteIds(hero, [
      { kind: 'renew', leaseId: 'odt-600-l1', newEnd: '2032-04-30' },
      prospect(['odt-700', 'odt-710']),
      { kind: 'vacate', leaseId: 'scn-1-odt-700', on: '2027-12-31' },
    ])
    expect([...ids].sort()).toEqual(['odt-600', 'odt-700', 'odt-710'])
  })

  it('is empty when the scenario does not apply', () => {
    expect(modifiedSuiteIds(hero, [{ kind: 'renew', leaseId: 'nope', newEnd: '2032-04-30' }]).size).toBe(0)
  })
})
