import { describe, it, expect } from 'vitest'
import { isAvailable, riskBucket, statusAt } from './status'
import { lease, suite } from './testing/fixtures'
import { BUNDLED_BUILDINGS } from '../data'
import { sliderDate } from './dates'
import { HORIZON_MONTHS } from './constants'

const TODAY = '2026-11-15'

describe('statusAt: required cases (spec-technical §5.1)', () => {
  it('a lease ending on D is active, and expiring', () => {
    const l = lease({ start: '2020-01-01', end: '2027-04-30' })
    expect(statusAt(suite({ leases: [l] }), '2027-04-30', TODAY)).toEqual({ status: 'expiring', lease: l })
  })

  it('end == D+12 months is expiring; one day later is occupied', () => {
    const D = '2027-01-15'
    const atEdge = lease({ end: '2028-01-15' })
    const past = lease({ end: '2028-01-16' })
    expect(statusAt(suite({ leases: [atEdge] }), D, TODAY).status).toBe('expiring')
    expect(statusAt(suite({ leases: [past] }), D, TODAY)).toEqual({ status: 'occupied', lease: past, openEnded: false })
  })

  it('a lease starting on D is active', () => {
    const l = lease({ start: '2027-01-15', end: '2032-01-14' })
    expect(statusAt(suite({ leases: [l] }), '2027-01-15', TODAY)).toEqual({ status: 'occupied', lease: l, openEnded: false })
  })

  it('a lease ending on today-1 leaves plain vacant at D > today', () => {
    const l = lease({ end: '2026-11-14' })
    expect(statusAt(suite({ leases: [l] }), '2027-01-01', TODAY)).toEqual({
      status: 'vacant', overlay: 'none', availableFrom: TODAY,
    })
  })

  it('a lease ending on today gives potential at D > today', () => {
    const l = lease({ end: TODAY })
    expect(statusAt(suite({ leases: [l] }), '2027-01-01', TODAY)).toEqual({
      status: 'vacant', overlay: 'potential', endedLease: l, availableFrom: '2026-11-16',
    })
  })

  it('an open-ended lease is never expiring or potential', () => {
    const s = suite({ leases: [lease({ start: '2019-01-01', end: null })] })
    for (let m = 0; m <= HORIZON_MONTHS; m += 1) {
      const st = statusAt(s, sliderDate(TODAY, m), TODAY)
      expect(st.status).toBe('occupied')
      expect(st).toMatchObject({ openEnded: true })
    }
  })

  it('a vacating lease gives overlay none with availableFrom = end + 1 day', () => {
    const l = lease({ start: '2022-06-01', end: '2027-05-31', vacating: true })
    const s = suite({ leases: [l] })
    expect(statusAt(s, '2027-07-01', TODAY)).toEqual({ status: 'vacant', overlay: 'none', availableFrom: '2027-06-01' })
    expect(statusAt(s, TODAY, TODAY)).toEqual({ status: 'expiring', lease: l })
  })

  it('a suite with both a past and a future lease is committed', () => {
    const past = lease({ tenant: 'Old', start: '2015-01-01', end: '2020-12-31' })
    const next = lease({ tenant: 'New', start: '2027-03-01', end: '2032-02-29' })
    expect(statusAt(suite({ leases: [past, next] }), TODAY, TODAY)).toEqual({
      status: 'vacant', overlay: 'committed', nextLease: next,
    })
  })
})

describe('statusAt: more boundaries', () => {
  it('committed wins over potential', () => {
    const ended = lease({ tenant: 'Old', start: '2015-01-01', end: '2027-01-31' })
    const next = lease({ tenant: 'New', start: '2027-06-01', end: '2032-05-31' })
    expect(statusAt(suite({ leases: [ended, next] }), '2027-03-01', TODAY)).toMatchObject({ overlay: 'committed', nextLease: next })
  })

  it('picks the earliest future lease as nextLease', () => {
    const later = lease({ tenant: 'B', start: '2029-01-01', end: '2030-12-31' })
    const sooner = lease({ tenant: 'A', start: '2027-01-01', end: '2028-12-31' })
    expect(statusAt(suite({ leases: [later, sooner] }), TODAY, TODAY)).toMatchObject({ nextLease: sooner })
  })

  it('a lease ending 2028-02-29 is occupied at 2027-02-28 and expiring at 2027-03-01', () => {
    const s = suite({ leases: [lease({ start: '2023-03-01', end: '2028-02-29' })] })
    expect(statusAt(s, '2027-02-28', TODAY).status).toBe('occupied')
    expect(statusAt(s, '2027-03-01', TODAY).status).toBe('expiring')
  })

  it('with several past leases, the latest ended lease decides potential', () => {
    const older = lease({ tenant: 'Older', start: '2015-01-01', end: '2020-12-31' })
    const latest = lease({ tenant: 'Latest', start: '2021-01-01', end: '2026-12-31' })
    expect(statusAt(suite({ leases: [latest, older] }), '2027-03-01', TODAY)).toEqual({
      status: 'vacant', overlay: 'potential', endedLease: latest, availableFrom: '2027-01-01',
    })
    const vacating = lease({ tenant: 'Leaving', start: '2027-01-01', end: '2027-02-28', vacating: true })
    expect(statusAt(suite({ leases: [latest, vacating] }), '2027-04-01', TODAY)).toEqual({
      status: 'vacant', overlay: 'none', availableFrom: '2027-03-01',
    })
  })

  it('D before today gives plain vacant for a lease that ended before today', () => {
    const l = lease({ start: '2020-01-01', end: '2026-11-01' })
    expect(statusAt(suite({ leases: [l] }), '2026-11-10', TODAY)).toEqual({ status: 'vacant', overlay: 'none', availableFrom: TODAY })
  })

  it('a suite with no leases is plain vacant from today', () => {
    expect(statusAt(suite(), '2028-01-01', TODAY)).toEqual({ status: 'vacant', overlay: 'none', availableFrom: TODAY })
  })

  it('a common suite is common whatever its leases', () => {
    expect(statusAt(suite({ kind: 'common', askingRentPsf: undefined }), TODAY, TODAY)).toEqual({ status: 'common' })
  })
})

describe('riskBucket', () => {
  const D = TODAY
  const bucket = (end: string | null) => riskBucket(suite({ leases: [lease({ end })] }), D, TODAY)

  it('end = D+6 months is le6; one day later is le12', () => {
    expect(bucket('2027-05-15')).toBe('le6')
    expect(bucket('2027-05-16')).toBe('le12')
  })
  it('places the other edges inclusively', () => {
    expect(bucket('2027-11-15')).toBe('le12')
    expect(bucket('2027-11-16')).toBe('le24')
    expect(bucket('2028-11-15')).toBe('le24')
    expect(bucket('2029-11-15')).toBe('le36')
    expect(bucket('2029-11-16')).toBe('gt36')
  })
  it('handles open-ended, vacant and common suites', () => {
    expect(bucket(null)).toBe('openEnded')
    expect(riskBucket(suite(), D, TODAY)).toBe('vacant')
    expect(riskBucket(suite({ kind: 'common' }), D, TODAY)).toBe('common')
  })

  it('puts the hero suites in the expected lease-risk buckets at today', () => {
    const hero = BUNDLED_BUILDINGS[0]
    const byNumber = new Map(hero.floors.flatMap((f) => f.suites).map((s) => [s.number, s]))
    const risk = (n: string) => {
      const s = byNumber.get(n)
      if (!s) throw new Error(`no suite ${n}`)
      return riskBucket(s, TODAY, TODAY)
    }
    expect(risk('600')).toBe('le6')
    expect(['400', '220', '1000'].map(risk)).toEqual(['le12', 'le12', 'le12'])
    expect(['210', '420'].map(risk)).toEqual(['le24', 'le24'])
    expect(risk('810')).toBe('le36')
    expect(risk('900')).toBe('gt36')
    expect(risk('230')).toBe('openEnded')
  })

  it('le6 and le12 together are exactly the expiring set at every step', () => {
    const suites = BUNDLED_BUILDINGS[0].floors.flatMap((f) => f.suites)
    for (let m = 0; m <= HORIZON_MONTHS; m += 1) {
      const D2 = sliderDate(TODAY, m)
      const expiring = suites.filter((s) => statusAt(s, D2, TODAY).status === 'expiring').map((s) => s.id)
      const le12 = suites.filter((s) => ['le6', 'le12'].includes(riskBucket(s, D2, TODAY))).map((s) => s.id)
      expect(le12).toEqual(expiring)
    }
  })
})

describe('isAvailable', () => {
  const D = '2027-07-01'
  const check = (s: ReturnType<typeof suite>, inclPot: boolean) => isAvailable(s, statusAt(s, D, TODAY), inclPot)

  it('plain vacant is available with the toggle on and off', () => {
    expect(check(suite(), true)).toBe(true)
    expect(check(suite(), false)).toBe(true)
  })
  it('potential is available only with the toggle on', () => {
    const s = suite({ leases: [lease({ end: '2027-04-30' })] })
    expect(check(s, true)).toBe(true)
    expect(check(s, false)).toBe(false)
  })
  it('committed is never available', () => {
    const s = suite({ leases: [lease({ start: '2028-01-01', end: '2032-12-31' })] })
    expect(check(s, true)).toBe(false)
    expect(check(s, false)).toBe(false)
  })
  it('occupied and expiring are never available', () => {
    expect(check(suite({ leases: [lease({ end: '2031-01-01' })] }), true)).toBe(false)
    expect(check(suite({ leases: [lease({ end: '2027-12-31' })] }), true)).toBe(false)
  })
  it('a vacating lease that has ended is available with the toggle off', () => {
    const s = suite({ leases: [lease({ end: '2027-05-31', vacating: true })] })
    expect(check(s, false)).toBe(true)
  })
  it('common space is never available', () => {
    expect(check(suite({ kind: 'common', askingRentPsf: undefined }), true)).toBe(false)
  })
})
