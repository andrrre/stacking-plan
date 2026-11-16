import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { statusAt } from '../../domain/status'
import { lease, suite } from '../../domain/testing/fixtures'
import type { ISODate, Suite } from '../../domain/types'
import type { ColourMode } from '../../app/state/types'
import { COMPACT_SF, suiteLabel } from './suiteLabel'

const TODAY = '2026-11-15'
const JUL = '2027-07-01'
const ODT = BUNDLED_BUILDINGS[0]

function odt(number: string): Suite {
  const found = ODT.floors.flatMap((f) => f.suites).find((s) => s.number === number)
  if (!found) throw new Error(`suite ${number} not in ODT`)
  return found
}

const label = (s: Suite, asOf: ISODate = TODAY, mode: ColourMode = 'availability') => suiteLabel(s, statusAt(s, asOf, TODAY), mode)

describe('suiteLabel: line 1', () => {
  it('carries the suite number and SF', () => {
    expect(label(odt('700'))).toMatchObject({ number: '700', sf: '4,300 SF', compact: false })
  })

  it(`a suite under ${COMPACT_SF.toLocaleString('en-US')} SF is compact (its number alone); one at it is not`, () => {
    expect(label(odt('720')).compact).toBe(true) // 1,900 SF
    expect(label(odt('510')).compact).toBe(true) // 2,150 SF
    expect(label(odt('220')).compact).toBe(false) // 2,600 SF
    expect(label(suite({ areaSf: COMPACT_SF - 1 })).compact).toBe(true)
    expect(label(suite({ areaSf: COMPACT_SF })).compact).toBe(false)
  })
})

describe('suiteLabel: line 2 (availability)', () => {
  it('occupied: the tenant', () => {
    expect(label(odt('900')).line2).toBe('Coralstone Insurance')
    expect(label(odt('230')).line2).toBe('Gullwing Print Co') // open-ended
  })

  it('vacant: "Vacant", also once a vacating lease has ended', () => {
    expect(label(odt('700')).line2).toBe('Vacant')
    expect(label(odt('400'), JUL).line2).toBe('Vacant')
  })

  it('expiring: "Tenant · ends MM/YYYY"', () => {
    expect(label(odt('600')).line2).toBe('Flamingo Row Media · ends 04/2027')
    expect(label(odt('400')).line2).toBe('Sunquay Logistics · ends 05/2027')
  })

  it('potential: "Potential · was Tenant"', () => {
    expect(label(odt('600'), JUL).line2).toBe('Potential · was Flamingo Row Media')
  })

  it('committed: "Committed · starts MM/YYYY"', () => {
    expect(label(odt('1010')).line2).toBe('Committed · starts 03/2027')
  })

  it('common areas: their name, else "Common area"', () => {
    expect(label(odt('100')).line2).toBe('Lobby')
    expect(label(suite({ kind: 'common', name: undefined })).line2).toBe('Common area')
  })
})

describe('suiteLabel: line 2 (lease risk)', () => {
  it('a leased suite also says when its lease ends, or that it has no end date', () => {
    expect(label(odt('900'), TODAY, 'risk').line2).toBe('Coralstone Insurance · ends 12/2029')
    expect(label(odt('230'), TODAY, 'risk').line2).toBe('Gullwing Print Co · no end date')
    expect(label(odt('600'), TODAY, 'risk').line2).toBe('Flamingo Row Media · ends 04/2027')
  })

  it('vacant, potential, committed and common areas read as in availability mode', () => {
    for (const [n, asOf] of [['700', TODAY], ['600', JUL], ['1010', TODAY], ['100', TODAY]] as const) {
      expect(label(odt(n), asOf, 'risk').line2, n).toBe(label(odt(n), asOf).line2)
    }
  })
})

describe('suiteLabel: input edge cases', () => {
  it('a long tenant name is kept whole (the view truncates it)', () => {
    const name = 'A'.repeat(80)
    const s = suite({ leases: [lease({ tenant: name, start: '2020-01-01', end: '2030-12-31' })] })
    expect(label(s).line2).toBe(name)
  })

  it('an empty common-area name falls back to "Common area"', () => {
    expect(label(suite({ kind: 'common', name: '' })).line2).toBe('Common area')
  })
})
