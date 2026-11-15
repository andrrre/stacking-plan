import { describe, it, expect } from 'vitest'
import type { Candidate } from '../../domain/types'
import { createEntry, entryId } from './entryId'

const candidate: Candidate = {
  key: 'odt-500', suiteIds: ['odt-500'], suiteNumbers: ['500'], floor: 5, totalSf: 10250, excessSf: 250,
  blendedRentPsf: 48, availableFrom: '2026-11-15', availability: 'now', caveats: [],
}

describe('entryId', () => {
  it('follows buildingId|asOf|key|b', () => {
    expect(entryId('odt', '2026-11-15', 'odt-500', false)).toBe('odt|2026-11-15|odt-500|b')
  })

  it('differs when the what-if flag differs', () => {
    expect(entryId('odt', '2026-11-15', 'odt-500', true)).toBe('odt|2026-11-15|odt-500|w')
    expect(entryId('odt', '2026-11-15', 'odt-500', true)).not.toBe(entryId('odt', '2026-11-15', 'odt-500', false))
  })

  it('differs by building and by date', () => {
    const base = entryId('odt', '2026-11-15', 'odt-500', false)
    expect(entryId('pbp', '2026-11-15', 'odt-500', false)).not.toBe(base)
    expect(entryId('odt', '2027-07-01', 'odt-500', false)).not.toBe(base)
  })
})

describe('createEntry', () => {
  it('carries the candidate, date and flag, with the matching id', () => {
    expect(createEntry('odt', candidate, '2026-11-15', true)).toEqual({
      id: 'odt|2026-11-15|odt-500|w', buildingId: 'odt', candidate, asOf: '2026-11-15', whatIf: true,
    })
  })
})
