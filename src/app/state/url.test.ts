import { describe, it, expect } from 'vitest'
import { parseUrlState, serializeUrl } from './url'
import { initState } from './init'
import { reducer } from './reducer'
import type { StorageLike } from './storage'
import type { AppState } from './types'

const CLOCK = '2026-11-15'
const empty: StorageLike = { getItem: () => null, setItem: () => undefined }
const base = initState('', empty, CLOCK)
const ctx = { today: CLOCK, buildingIds: ['odt', 'pbp', 'csv-abc'] }

describe('parseUrlState', () => {
  it('reads every parameter', () => {
    const p = parseUrlState('?b=pbp&asOf=2027-05-01&mode=risk&view=3d&min=9000&max=11000&rent=60.5&pot=0', ctx)
    expect(p).toEqual({
      buildingId: 'pbp', asOf: '2027-05-01', mode: 'risk', view: '3d',
      req: { minSf: 9000, maxSf: 11000, maxRentPsf: 60.5, includePotential: false },
    })
  })

  it('returns nothing for an empty query', () => {
    expect(parseUrlState('', ctx)).toEqual({})
  })

  it('ignores each garbage parameter on its own', () => {
    const p = parseUrlState('?asOf=banana&min=-5&mode=x&pot=7&view=cube&max=abc&rent=0&b=pbp', ctx)
    expect(p).toEqual({ buildingId: 'pbp' })
  })

  it('a bad parameter does not spoil its neighbours', () => {
    expect(parseUrlState('?min=bad&max=5000', ctx)).toEqual({ req: { maxSf: 5000 } })
  })

  it('falls back to the hero for an unknown building, keeps an imported id', () => {
    expect(parseUrlState('?b=nope', ctx)).toEqual({})
    expect(parseUrlState('?b=csv-abc', ctx)).toEqual({ buildingId: 'csv-abc' })
  })

  it('snaps and clamps asOf to a slider step', () => {
    expect(parseUrlState('?asOf=2027-05-17', ctx).asOf).toBe('2027-05-01')
    expect(parseUrlState('?asOf=2020-01-01', ctx).asOf).toBe(CLOCK)
    expect(parseUrlState('?asOf=2099-01-01', ctx).asOf).toBe('2031-11-01')
  })

  it('applies the A13 bounds', () => {
    expect(parseUrlState('?min=0', ctx)).toEqual({})
    expect(parseUrlState('?min=1000001', ctx)).toEqual({})
    expect(parseUrlState('?min=1000000', ctx)).toEqual({ req: { minSf: 1000000 } })
    expect(parseUrlState('?min=1.5', ctx)).toEqual({})
    expect(parseUrlState('?rent=1001', ctx)).toEqual({})
    expect(parseUrlState('?rent=1000', ctx)).toEqual({ req: { maxRentPsf: 1000 } })
  })

  it('reads floor as a whole number (a basement may be 0 or below)', () => {
    expect(parseUrlState('?floor=5', ctx)).toEqual({ floor: 5 })
    expect(parseUrlState('?floor=-1', ctx)).toEqual({ floor: -1 })
    for (const bad of ['1.5', 'top', '', '--1', '5e2']) expect(parseUrlState(`?floor=${bad}`, ctx)).toEqual({})
  })

  it('reads a legend key the colour mode shows, and ignores any other', () => {
    expect(parseUrlState('?legend=vacant', ctx)).toEqual({ legend: 'vacant' })
    expect(parseUrlState('?mode=risk&legend=risk-le12', ctx)).toEqual({ mode: 'risk', legend: 'risk-le12' })
    expect(parseUrlState('?legend=risk-le12', ctx)).toEqual({})
    expect(parseUrlState('?mode=risk&legend=expiring', ctx)).toEqual({ mode: 'risk' })
    for (const bad of ['', 'VACANT', 'x', 'vacant ']) expect(parseUrlState(`?legend=${bad}`, ctx)).toEqual({})
  })

  it('drops max when it is below min', () => {
    expect(parseUrlState('?min=9000&max=5000', ctx)).toEqual({ req: { minSf: 9000 } })
    expect(parseUrlState('?min=9000&max=9000', ctx)).toEqual({ req: { minSf: 9000, maxSf: 9000 } })
  })
})

describe('initState with a URL', () => {
  it('applies the URL over the defaults', () => {
    const s = initState('?today=2026-11-15&b=pbp&asOf=2027-05-01&mode=risk&min=9000&pot=0', empty, CLOCK)
    expect(s).toMatchObject({ buildingId: 'pbp', asOf: '2027-05-01', mode: 'risk' })
    expect(s.req).toEqual({ minSf: 9000, maxSf: null, maxRentPsf: null, includePotential: false })
  })

  it('snaps asOf relative to the overridden today', () => {
    expect(initState('?today=2027-01-10&asOf=2027-03-20', empty, CLOCK).asOf).toBe('2027-03-01')
  })

  it('never puts max below min into state', () => {
    const s = initState('?min=9000&max=5000', empty, CLOCK)
    expect(s.req.minSf).toBe(9000)
    expect(s.req.maxSf).toBeNull()
  })

  it('opens floor view on a floor of the building shown, and ignores an unknown floor', () => {
    expect(initState('?floor=5', empty, CLOCK).floor).toBe(5)
    expect(initState('?floor=13', empty, CLOCK).floor).toBeNull()
    expect(initState('?b=pbp&floor=7', empty, CLOCK).floor).toBe(7)
    expect(initState('?b=pbp&floor=9', empty, CLOCK).floor).toBeNull()
    expect(initState('', empty, CLOCK).floor).toBeNull()
  })

  it('starts with the legend filter from the URL, not presenting', () => {
    expect(initState('?legend=committed', empty, CLOCK).legend).toBe('committed')
    expect(initState('', empty, CLOCK)).toMatchObject({ legend: null, presenting: false })
  })

  it('accepts a stored imported building id', () => {
    const imported = { id: 'csv-abc', name: 'X', address: '', floors: [{ number: 1, suites: [{ id: 'a', number: '1', areaSf: 100, kind: 'common' as const, joinsNext: false, leases: [] }] }] }
    const storage: StorageLike = { getItem: (k) => (k.endsWith('imported') ? JSON.stringify([imported]) : null), setItem: () => undefined }
    expect(initState('?b=csv-abc', storage, CLOCK).buildingId).toBe('csv-abc')
  })
})

describe('serializeUrl', () => {
  const full: AppState = {
    ...base, buildingId: 'pbp', asOf: '2027-05-01', mode: 'risk', view: 'stack',
    req: { minSf: 9000, maxSf: 11000, maxRentPsf: 60, includePotential: false },
  }

  it('writes nothing for the defaults', () => {
    expect(base.view).toBe('3d')
    expect(serializeUrl(base, '', false)).toBe('')
  })

  it('writes view=stack only for the 2D stack; the 3D building is the default and writes nothing', () => {
    expect(serializeUrl({ ...base, view: 'stack' }, '', false)).toBe('?view=stack')
    expect(serializeUrl({ ...base, view: '3d' }, '?view=3d', false)).toBe('')
    expect(parseUrlState(serializeUrl({ ...base, view: 'stack' }, '', false), ctx)).toEqual({ view: 'stack' })
    expect(parseUrlState('?view=3d', ctx)).toEqual({ view: '3d' })
  })

  it('writes every parameter', () => {
    expect(serializeUrl(full, '', true)).toBe(
      '?today=2026-11-15&b=pbp&asOf=2027-05-01&mode=risk&view=stack&min=9000&max=11000&rent=60&pot=0',
    )
  })

  it('writes today only when asked', () => {
    expect(serializeUrl(base, '', true)).toBe('?today=2026-11-15')
    expect(serializeUrl(full, '', false)).not.toContain('today')
  })

  it('writes floor only in floor view, and it round-trips', () => {
    expect(serializeUrl({ ...base, floor: null }, '?floor=4', false)).toBe('')
    expect(serializeUrl({ ...base, floor: 7 }, '', false)).toBe('?floor=7')
    expect(parseUrlState(serializeUrl({ ...base, floor: 7 }, '', false), ctx)).toEqual({ floor: 7 })
  })

  it('keeps floor out of the URL while the 2D stack is the chosen view', () => {
    expect(serializeUrl({ ...base, view: 'stack', floor: 7 }, '?floor=7', false)).toBe('?view=stack')
  })

  it('writes the legend filter, and it round-trips', () => {
    expect(serializeUrl({ ...base, legend: null }, '?legend=vacant', false)).toBe('')
    expect(serializeUrl({ ...base, legend: 'vacant' }, '', false)).toBe('?legend=vacant')
    expect(parseUrlState(serializeUrl({ ...base, legend: 'vacant' }, '', false), ctx)).toEqual({ legend: 'vacant' })
  })

  it('never writes presentation mode', () => {
    expect(serializeUrl({ ...base, presenting: true }, '', false)).toBe('')
  })

  it('never writes the move preview', () => {
    const preview = { key: 'k' } as AppState['movePreview']
    expect(serializeUrl({ ...base, movePreview: preview }, '', false)).toBe('')
  })

  it('omits the pot parameter when potential is on', () => {
    expect(serializeUrl({ ...base, req: { ...base.req, minSf: 5000 } }, '', false)).toBe('?min=5000')
  })

  it('round-trips through parseUrlState', () => {
    const search = serializeUrl(full, '', true)
    expect(parseUrlState(search, ctx)).toEqual({
      buildingId: 'pbp', asOf: '2027-05-01', mode: 'risk', view: 'stack',
      req: { minSf: 9000, maxSf: 11000, maxRentPsf: 60, includePotential: false },
    })
  })

  it('keeps unrelated parameters and drops garbage in managed ones', () => {
    expect(serializeUrl(base, '?utm=1&min=-5&mode=x', false)).toBe('?utm=1')
  })

  it('C1: noFit/jump writes asOf and no pot', () => {
    const s = reducer(
      { ...base, req: { ...base.req, minSf: 12000, includePotential: false } },
      { type: 'noFit/jump', asOf: '2027-05-01' },
    )
    const search = serializeUrl(s, '', false)
    expect(search).toContain('asOf=2027-05-01')
    expect(search).not.toContain('pot')
  })
})
