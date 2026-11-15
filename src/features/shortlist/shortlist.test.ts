import { describe, it, expect } from 'vitest'
import { initState } from '../../app/state/init'
import { reducer } from '../../app/state/reducer'
import type { AppState } from '../../app/state/types'
import { findFits } from '../../domain/findFits'
import { BUNDLED_BUILDINGS } from '../../data'
import { createEntry } from './entryId'

const TODAY = '2026-11-15'
const hero = BUNDLED_BUILDINGS[0]
const req = { minSf: 10_000, includePotential: true }
const first = findFits(hero, req, TODAY, TODAY)[0]!

const base = (): AppState => initState('', null, TODAY)
const saveFrom = (s: AppState) => createEntry(s.buildingId, first, s.asOf, s.changes.length > 0)

describe('shortlist state', () => {
  it('saving the same match twice gives one entry', () => {
    const s0 = base()
    const e = saveFrom(s0)
    const s2 = reducer(reducer(s0, { type: 'shortlist/add', entry: e }), { type: 'shortlist/add', entry: e })
    expect(s2.shortlist).toHaveLength(1)
  })

  it('an entry is unchanged after a date move and after a scenario change (C5)', () => {
    const s0 = reducer(base(), { type: 'shortlist/add', entry: saveFrom(base()) })
    const saved = JSON.stringify(s0.shortlist)
    const moved = reducer(s0, { type: 'asOf/set', asOf: '2027-07-01' })
    const scenario = reducer(moved, { type: 'scenario/add', change: { kind: 'vacate', leaseId: 'odt-600-l1', on: '2027-01-31' } })
    expect(JSON.stringify(moved.shortlist)).toBe(saved)
    expect(JSON.stringify(scenario.shortlist)).toBe(saved)
  })

  it('whatIf is true exactly when the scenario has changes', () => {
    const s0 = base()
    expect(saveFrom(s0).whatIf).toBe(false)
    const withChange = reducer(s0, { type: 'scenario/add', change: { kind: 'vacate', leaseId: 'odt-600-l1', on: '2027-01-31' } })
    const e = saveFrom(withChange)
    expect(e.whatIf).toBe(true)
    expect(e.id.endsWith('|w')).toBe(true)
  })

  it('the same match saved with and without a scenario are two entries', () => {
    const s0 = base()
    const withChange = reducer(s0, { type: 'scenario/add', change: { kind: 'vacate', leaseId: 'odt-600-l1', on: '2027-01-31' } })
    const s = reducer(reducer(s0, { type: 'shortlist/add', entry: saveFrom(s0) }), { type: 'shortlist/add', entry: saveFrom(withChange) })
    expect(s.shortlist).toHaveLength(2)
  })

  it('caps at 10 entries', () => {
    let s = base()
    for (let i = 0; i < 12; i++) s = reducer(s, { type: 'shortlist/add', entry: createEntry(s.buildingId, { ...first, key: `k${i}` }, s.asOf, false) })
    expect(s.shortlist).toHaveLength(10)
  })
})
