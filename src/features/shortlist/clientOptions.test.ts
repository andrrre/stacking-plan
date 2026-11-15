import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { findFits } from '../../domain/findFits'
import type { Candidate } from '../../domain/types'
import { clientOptions } from './clientOptions'
import { createEntry } from './entryId'

const TODAY = '2026-11-15'
const hero = BUNDLED_BUILDINGS[0]
const six = findFits(hero, { minSf: 10_000, includePotential: true }, '2027-07-01', TODAY).find((c) => c.key === 'odt-600') as Candidate
const placed: Candidate = { ...six, key: 'p', caveats: [{ kind: 'assumesNoRenewal', tenant: 'Placed Co', leaseEnd: '2027-04-30' }] }
const tenants = BUNDLED_BUILDINGS.flatMap((b) => b.floors.flatMap((f) => f.suites.flatMap((s) => s.leases.map((l) => l.tenant))))

describe('clientOptions', () => {
  const entries = [createEntry(hero.id, six, '2027-07-01', false), createEntry(hero.id, placed, '2027-07-01', true)]
  const options = clientOptions(entries)

  it('projects rank, label, facts, client notes and the what-if flag', () => {
    expect(options[0]).toEqual({
      rank: 1, label: 'Suite 600', floor: 6, suiteNumbers: ['600'], totalSf: 12_400, blendedRentPsf: 50,
      availableFrom: '2027-05-01', notes: ['Subject to the current tenant vacating (30 Apr 2027).'], whatIf: false,
    })
    expect(options[1]?.rank).toBe(2)
    expect(options[1]?.notes).toContain('Indicative: depends on lease changes not yet confirmed.')
  })

  it('its JSON has no tenant name from either building or from a caveat', () => {
    const json = JSON.stringify(options)
    expect(JSON.stringify(entries)).toContain('Placed Co')
    expect(tenants.length).toBeGreaterThan(40)
    for (const t of [...tenants, 'Placed Co', 'Flamingo']) expect(json).not.toContain(t)
  })
})
