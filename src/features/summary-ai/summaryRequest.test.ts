import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { findFits } from '../../domain/findFits'
import type { Building, Candidate } from '../../domain/types'
import { SummaryRequestSchema } from '../../shared/summary.schema'
import { clientOptions, type ClientOption } from '../shortlist/clientOptions'
import { createEntry } from '../shortlist/entryId'
import { toSummaryRequest } from './summaryRequest'

const TODAY = '2026-11-15'
const JUL = '2027-07-01'
const hero = BUNDLED_BUILDINGS[0]
const req = { minSf: 10_000, includePotential: true }
const nowMatch = findFits(hero, req, TODAY, TODAY).find((c) => c.key === 'odt-500') as Candidate
const potential = findFits(hero, req, JUL, TODAY).find((c) => c.key === 'odt-600') as Candidate

const tenants = (b: Building) => b.floors.flatMap((f) => f.suites.flatMap((s) => s.leases.map((l) => l.tenant)))
const ALL_TENANTS = BUNDLED_BUILDINGS.flatMap(tenants)

const entry = (c: Candidate, asOf: string, i = 0) => createEntry(hero.id, { ...c, key: `${c.key}-${i}` }, asOf, false)

describe('toSummaryRequest', () => {
  it('the fixture can fail: the stored caveat names a tenant', () => {
    expect(JSON.stringify(potential.caveats)).toContain('Flamingo Row Media')
  })

  it('builds a valid request from the client projection, with no tenant name and no lease rent field', () => {
    const options = clientOptions([entry(nowMatch, TODAY), entry(potential, JUL)])
    const body = toSummaryRequest(hero.name, TODAY, options)
    expect(SummaryRequestSchema.safeParse(body).success).toBe(true)
    const json = JSON.stringify(body)
    for (const t of ALL_TENANTS) expect(json, t).not.toContain(t)
    expect(json).toContain('Subject to the current tenant vacating (30 Apr 2027)')
    expect(body.options[1]).toEqual({
      label: 'Suite 600',
      floor: 6,
      suiteNumbers: ['600'],
      totalSf: potential.totalSf,
      blendedRentPsf: potential.blendedRentPsf,
      availableFrom: potential.availableFrom,
      notes: ['Subject to the current tenant vacating (30 Apr 2027).'],
    })
  })

  it('takes only the first 5 of a shortlist of 7, in order', () => {
    const options = clientOptions(Array.from({ length: 7 }, (_, i) => entry(nowMatch, TODAY, i)))
    const body = toSummaryRequest(hero.name, TODAY, options)
    expect(body.options).toHaveLength(5)
    expect(SummaryRequestSchema.safeParse(body).success).toBe(true)
  })

  it('does not mutate its input', () => {
    const options = clientOptions([entry(nowMatch, TODAY)])
    const copy = structuredClone(options)
    toSummaryRequest(hero.name, TODAY, options)
    expect(options).toEqual(copy)
  })

  it('keeps label and notes inside the schema limits', () => {
    const o = clientOptions([entry(nowMatch, TODAY)])[0] as ClientOption
    const long = { ...o, label: 'L'.repeat(60), notes: ['n'.repeat(300)] }
    const body = toSummaryRequest('B'.repeat(200), TODAY, [long])
    expect(SummaryRequestSchema.safeParse(body).success).toBe(true)
  })
})
