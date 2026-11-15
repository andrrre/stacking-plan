import { describe, it, expect } from 'vitest'
import type { Change } from '../../domain/types'
import { initState } from './init'
import { selectBuilding } from './selectBuilding'
import { selectBaseBuilding } from './selectors'
import type { AppState } from './types'

const TODAY = '2026-11-15'
const base: AppState = initState('', null, TODAY)
const place: Change = { kind: 'newLease', suiteIds: ['odt-500'], tenant: 'Prospect', start: TODAY, end: '2031-11-14', rentPsf: 48 }

const suite500 = (s: AppState) => selectBuilding(s).floors.flatMap((f) => f.suites).find((x) => x.id === 'odt-500')

describe('selectBuilding', () => {
  it('with no changes returns the base building', () => {
    expect(selectBuilding(base)).toBe(selectBaseBuilding(base))
  })

  it('applies the scenario', () => {
    const s = { ...base, changes: [place] }
    expect(selectBuilding(s)).not.toBe(selectBaseBuilding(s))
    expect(suite500(s)?.leases.map((l) => l.id)).toContain('scn-0-odt-500')
    expect(selectBaseBuilding(s).floors.flatMap((f) => f.suites).find((x) => x.id === 'odt-500')?.leases).toHaveLength(1)
  })

  it('returns the same object for the same base and changes, across unrelated state changes', () => {
    const s = { ...base, changes: [place] }
    const first = selectBuilding(s)
    expect(selectBuilding(s)).toBe(first)
    expect(selectBuilding({ ...s, asOf: '2027-07-01', mode: 'risk' })).toBe(first)
  })

  it('a new changes list gives a new building', () => {
    const s = { ...base, changes: [place] }
    const first = selectBuilding(s)
    const next = selectBuilding({ ...s, changes: [place, { kind: 'renew', leaseId: 'odt-600-l1', newEnd: '2032-04-30' }] })
    expect(next).not.toBe(first)
    expect(selectBuilding({ ...s, changes: [] })).toBe(selectBaseBuilding(s))
  })

  it('falls back to the base building when the scenario does not apply', () => {
    const s: AppState = { ...base, changes: [{ kind: 'renew', leaseId: 'nope', newEnd: '2032-04-30' }] }
    expect(selectBuilding(s)).toBe(selectBaseBuilding(s))
    expect(selectBuilding(s)).toBe(selectBuilding(s))
  })
})
