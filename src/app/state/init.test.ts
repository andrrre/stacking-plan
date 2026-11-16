import { describe, it, expect } from 'vitest'
import { initState } from './init'
import { SHORTLIST_KEY, type StorageLike } from './storage'

const CLOCK = '2026-11-15'
const empty: StorageLike = { getItem: () => null, setItem: () => undefined }

describe('initState', () => {
  it('uses the clock date by default, with defaults for everything else', () => {
    expect(initState('', empty, CLOCK)).toEqual({
      today: CLOCK,
      buildingId: 'odt',
      asOf: CLOCK,
      mode: 'availability',
      view: '3d',
      req: { minSf: null, maxSf: null, maxRentPsf: null, includePotential: true },
      selection: null,
      highlight: null,
      changes: [],
      shortlist: [],
      importedBuildings: [],
      overlay: 'none',
      floor: null,
      legend: null,
      presenting: false,
      movePreview: null,
      tour: null,
    })
  })

  it('?today= overrides the clock', () => {
    const s = initState('?today=2027-01-10', empty, CLOCK)
    expect(s.today).toBe('2027-01-10')
    expect(s.asOf).toBe('2027-01-10')
  })

  it('ignores an invalid today value', () => {
    for (const bad of ['garbage', '2027-02-30', '2027-1-10', '']) {
      expect(initState(`?today=${bad}`, empty, CLOCK).today).toBe(CLOCK)
    }
  })

  it('ignores a today outside 1900-01-01..2200-12-31 and uses the clock', () => {
    for (const far of ['9999-12-31', '2201-01-01', '1899-12-31']) {
      const s = initState(`?today=${far}`, empty, CLOCK)
      expect(s.today).toBe(CLOCK)
      expect(s.asOf).toBe(CLOCK)
    }
    expect(initState('?today=2200-12-31', empty, CLOCK).today).toBe('2200-12-31')
  })

  it('reads the shortlist from storage and survives bad storage', () => {
    const bad: StorageLike = { getItem: (k) => (k === SHORTLIST_KEY ? '[[' : null), setItem: () => undefined }
    expect(initState('', bad, CLOCK).shortlist).toEqual([])
    expect(initState('', null, CLOCK).importedBuildings).toEqual([])
  })
})
