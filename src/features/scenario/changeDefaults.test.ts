import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { addDaysIso, addMonthsIso } from '../../domain/dates'
import { findFits } from '../../domain/findFits'
import { findLease } from '../../domain/scenario'
import type { Candidate, Lease } from '../../domain/types'
import { fiveYearEnd, leaseChange, placeTenantChange, renewChange, vacateChange } from './changeDefaults'

const TODAY = '2026-11-15'
const hero = BUNDLED_BUILDINGS[0]

function fit(key: string): Candidate {
  const c = findFits(hero, { minSf: 10_000, includePotential: true }, TODAY, TODAY).find((x) => x.key === key)
  if (!c) throw new Error(`no candidate ${key}`)
  return c
}

function heroLease(id: string): Lease {
  const loc = findLease(hero, id)
  if (!loc) throw new Error(`no lease ${id}`)
  return loc.lease
}

describe('fiveYearEnd', () => {
  it('is start + 60 months − 1 day', () => {
    expect(fiveYearEnd(TODAY)).toBe('2031-11-14')
    expect(fiveYearEnd('2027-03-01')).toBe('2032-02-29')
    expect(fiveYearEnd('2027-01-01')).toBe(addDaysIso(addMonthsIso('2027-01-01', 60), -1))
  })
})

describe('placeTenantChange', () => {
  it('500: tenant Prospect, start D, five-year term, the asking rent, the candidate suites', () => {
    expect(placeTenantChange(fit('odt-500'), TODAY)).toEqual({
      kind: 'newLease', suiteIds: ['odt-500'], tenant: 'Prospect', start: TODAY, end: '2031-11-14', rentPsf: 48,
    })
  })

  it('700+710 takes both suites and the blended asking rent', () => {
    const c = fit('odt-700+odt-710')
    const change = placeTenantChange(c, '2027-07-01')
    expect(change).toMatchObject({ suiteIds: ['odt-700', 'odt-710'], start: '2027-07-01', end: '2032-06-30' })
    expect(change.kind === 'newLease' && change.rentPsf).toBe(c.blendedRentPsf)
  })
})

describe('leaseChange', () => {
  it('one suite at its asking rent from D', () => {
    const s = hero.floors.flatMap((f) => f.suites).find((x) => x.id === 'odt-1010')
    if (!s) throw new Error('no 1010')
    expect(leaseChange(s, TODAY)).toEqual({
      kind: 'newLease', suiteIds: ['odt-1010'], tenant: 'Prospect', start: TODAY, end: '2031-11-14', rentPsf: 56,
    })
  })
})

describe('renewChange', () => {
  it('extends five years past the current end', () => {
    expect(renewChange(heroLease('odt-600-l1'))).toEqual({ kind: 'renew', leaseId: 'odt-600-l1', newEnd: '2032-04-30' })
  })

  it('is null for an open-ended lease', () => {
    expect(renewChange(heroLease('odt-230-l1'))).toBeNull()
  })
})

describe('vacateChange', () => {
  it('defaults to the lease end', () => {
    expect(vacateChange(heroLease('odt-600-l1'), TODAY)).toEqual({ kind: 'vacate', leaseId: 'odt-600-l1', on: '2027-04-30' })
  })

  it('defaults to D for an open-ended lease', () => {
    expect(vacateChange(heroLease('odt-230-l1'), '2027-07-01')).toEqual({ kind: 'vacate', leaseId: 'odt-230-l1', on: '2027-07-01' })
  })
})
