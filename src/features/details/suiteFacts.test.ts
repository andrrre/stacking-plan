import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { statusAt } from '../../domain/status'
import { building, floor, lease, suite } from '../../domain/testing/fixtures'
import type { Floor, ISODate } from '../../domain/types'
import { contiguousOnFloor, leaseText, locate, monthsText, statusKey, tenantLine } from './suiteFacts'

const TODAY = '2026-11-15'
const JUL = '2027-07-01'
const ODT = BUNDLED_BUILDINGS[0]
const odtFloor = (n: number) => ODT.floors.find((f) => f.number === n) as Floor
const odt = (n: string) => ODT.floors.flatMap((f) => f.suites).find((s) => s.number === n) as Floor['suites'][number]
const st = (n: string, asOf: ISODate = TODAY) => statusAt(odt(n), asOf, TODAY)

const b = building({
  floors: [floor({
    number: 1,
    suites: [
      suite({ id: 'a', number: '100', joinsNext: true }),
      suite({ id: 'c', number: '110', kind: 'common', joinsNext: true }),
      suite({ id: 'd', number: '120' }),
    ],
  })],
})

describe('suiteFacts', () => {
  it('a leasable suite does not list a common neighbour', () => {
    expect(locate(b, 'a')?.neighbours).toEqual([])
  })

  it('a leasable suite does not list a common neighbour on its left either', () => {
    expect(locate(b, 'd')?.neighbours).toEqual([])
  })

  it('a common suite has no combine neighbours', () => {
    expect(locate(b, 'c')?.neighbours).toEqual([])
  })

  it('monthsText', () => {
    expect(monthsText(0)).toBe('< 1 month')
    expect(monthsText(1)).toBe('1 month')
    expect(monthsText(5)).toBe('5 months')
  })
})

describe('statusKey (the status chip)', () => {
  it('names the availability status, overlays included, whatever the colour mode', () => {
    expect(['900', '600', '700', '1010', '100'].map((n) => statusKey(st(n)))).toEqual(['occupied', 'expiring', 'vacant', 'committed', 'common'])
    expect(statusKey(st('600', JUL))).toBe('potential')
  })
})

describe('tenantLine', () => {
  it('the tenant; "Available for lease" for vacant space; the previous tenant for potential space', () => {
    expect(tenantLine(odt('900'), st('900'))).toBe('Coralstone Insurance')
    expect(tenantLine(odt('700'), st('700'))).toBe('Available for lease')
    expect(tenantLine(odt('600'), st('600', JUL))).toBe('Potential availability · previously Flamingo Row Media')
  })

  it('the incoming tenant for committed space, the area name for common space', () => {
    expect(tenantLine(odt('1010'), st('1010'))).toBe('Committed to Bayfront Dental Group')
    expect(tenantLine(odt('100'), st('100'))).toBe('Lobby')
    expect(tenantLine(suite({ kind: 'common' }), { status: 'common' })).toBe('Common area')
  })
})

describe('leaseText', () => {
  it('"Ends MM/YYYY" for a lease with an end, "No end date" without', () => {
    expect(leaseText(st('600'), TODAY)).toBe('Ends 04/2027')
    expect(leaseText(st('900'), TODAY)).toBe('Ends 12/2029')
    expect(leaseText(st('230'), TODAY)).toBe('No end date')
  })

  it('"Ended MM/YYYY" for potential space, "Starts MM/YYYY" for committed space', () => {
    expect(leaseText(st('600', JUL), TODAY)).toBe('Ended 04/2027')
    expect(leaseText(st('1010'), TODAY)).toBe('Starts 03/2027')
  })

  it('"Available now" for vacant space, or the month it came free after today; "—" for common space', () => {
    expect(leaseText(st('700'), TODAY)).toBe('Available now')
    expect(leaseText(st('400', JUL), TODAY)).toBe('Available from 06/2027')
    expect(leaseText(st('100'), TODAY)).toBe('—')
  })
})

describe('contiguousOnFloor', () => {
  it('the SF of the available run the suite is in: 700 + 710 on floor 7', () => {
    expect(contiguousOnFloor(odtFloor(7), 'odt-700', TODAY, TODAY, true)).toBe(10_500)
    expect(contiguousOnFloor(odtFloor(7), 'odt-710', TODAY, TODAY, true)).toBe(10_500)
  })

  it('a suite alone in its run gives its own SF (300 and 310 are split by a wall)', () => {
    expect(contiguousOnFloor(odtFloor(3), 'odt-300', TODAY, TODAY, true)).toBe(5_600)
  })

  it('null for a suite that is not available: leased, committed, common, or potential when potential is off', () => {
    expect(contiguousOnFloor(odtFloor(7), 'odt-720', TODAY, TODAY, true)).toBeNull()
    expect(contiguousOnFloor(odtFloor(10), 'odt-1010', TODAY, TODAY, true)).toBeNull()
    expect(contiguousOnFloor(odtFloor(1), 'odt-100', TODAY, TODAY, true)).toBeNull()
    expect(contiguousOnFloor(odtFloor(6), 'odt-600', JUL, TODAY, true)).toBe(12_400)
    expect(contiguousOnFloor(odtFloor(6), 'odt-600', JUL, TODAY, false)).toBeNull()
  })

  it('null for a suite not on the floor', () => {
    expect(contiguousOnFloor(odtFloor(7), 'odt-500', TODAY, TODAY, true)).toBeNull()
  })

  it('follows the date: a lease that starts later frees nothing now', () => {
    const f = floor({ number: 1, suites: [suite({ id: 'x', leases: [lease({ start: '2027-01-01' })] })] })
    expect(contiguousOnFloor(f, 'x', TODAY, TODAY, true)).toBeNull()
  })
})
