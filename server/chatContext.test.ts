// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { BUNDLED_BUILDINGS } from '../src/data/index.js'
import { kpis } from '../src/domain/kpis.js'
import { statusAt } from '../src/domain/status.js'
import type { Building, Change } from '../src/domain/types.js'
import { chatContext } from './chatContext.js'

const TODAY = '2026-11-15'
const ODT = BUNDLED_BUILDINGS.find((b) => b.id === 'odt') as Building

const snapshot = (changes: Change[] = [], buildingId = 'odt') => ({ buildingId, today: TODAY, asOf: TODAY, changes })

/** A lease active on TODAY that started before yesterday, so it can be vacated yesterday. */
function activeLeaseId(b: Building): string {
  for (const s of b.floors.flatMap((f) => f.suites)) {
    const st = statusAt(s, TODAY, TODAY)
    if ((st.status === 'occupied' || st.status === 'expiring') && st.lease.start < '2026-11-14') return st.lease.id
  }
  throw new Error('no active lease in the fixture building')
}

describe('chatContext', () => {
  it('resolves a bundled building with the request dates and no scenario', () => {
    const r = chatContext(snapshot())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.context.building).toBe(ODT)
    expect(r.context.today).toBe(TODAY)
    expect(r.context.asOf).toBe(TODAY)
    expect(r.context.scenario).toBe(false)
  })

  it('errors on an unknown building id', () => {
    const r = chatContext(snapshot([], 'no-such-building'))
    expect(r.ok).toBe(false)
  })

  it('applies a valid vacate change, so the vacant area differs from the base', () => {
    const r = chatContext(snapshot([{ kind: 'vacate', leaseId: activeLeaseId(ODT), on: '2026-11-14' }]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.context.scenario).toBe(true)
    const base = kpis(ODT, TODAY, TODAY, true).vacantSf
    expect(kpis(r.context.building, TODAY, TODAY, true).vacantSf).not.toBe(base)
  })

  it('errors on a change that does not apply (unknown lease id) instead of falling back to the base', () => {
    const r = chatContext(snapshot([{ kind: 'vacate', leaseId: 'no-such-lease', on: TODAY }]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/no-such-lease/)
  })

  it('sets scenario only when there are changes', () => {
    const none = chatContext(snapshot())
    expect(none.ok && none.context.scenario).toBe(false)
  })
})
