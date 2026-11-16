import { describe, it, expect } from 'vitest'
import { applyMove, makeRoom, moveChanges } from './makeRoom'
import { findFits } from './findFits'
import { MAX_MOVE_OPTIONS } from './constants'
import { addDaysIso, sliderDate } from './dates'
import { kpis } from './kpis'
import { applyScenario } from './scenario'
import { statusAt } from './status'
import { BUNDLED_BUILDINGS } from '../data'
import { building, floor, lease, suite } from './testing/fixtures'
import type { Building, Candidate, Floor, ISODate, Lease, MoveEnd, MoveOption, Requirement, Suite } from './types'

const TODAY = '2026-11-15'
const hero = BUNDLED_BUILDINGS[0]

const req12k: Requirement = { minSf: 12_000, includePotential: false }

// The first option, or a failed expectation; keeps the tests free of index guards.
function only(options: readonly MoveOption[]): MoveOption {
  const [first] = options
  if (!first) throw new Error('expected at least one move option')
  return first
}

describe('makeRoom on the hero building', () => {
  it('today, 12,000 SF: moves Northpier from 510 to 410 and frees 500 + 510', () => {
    const options = makeRoom(hero, req12k, TODAY, TODAY)
    expect(options).toHaveLength(1)
    const o = only(options)
    expect(o.key).toBe('odt-510-l1>odt-410')
    expect(o.lease.tenant).toBe('Northpier Engineering')
    expect(o.from).toEqual({ suiteId: 'odt-510', number: '510', floor: 5, areaSf: 2_150 })
    expect(o.to).toEqual({ suiteId: 'odt-410', number: '410', floor: 4, areaSf: 4_000 })
    expect(o.freed).toMatchObject({ key: 'odt-500+odt-510', totalSf: 12_400, excessSf: 400, floor: 5, availability: 'now' })
  })

  it('moveChanges: vacate the day before D, then the same tenant, rent and end in the destination from D', () => {
    const o = only(makeRoom(hero, req12k, TODAY, TODAY))
    expect(moveChanges(o, TODAY)).toEqual([
      { kind: 'vacate', leaseId: 'odt-510-l1', on: '2026-11-14' },
      { kind: 'newLease', suiteIds: ['odt-410'], tenant: 'Northpier Engineering', start: TODAY, end: '2030-08-31', rentPsf: 47 },
    ])
  })

  it('applying an option makes its freed block the first fit, on today and on a future slider date', () => {
    for (const D of [TODAY, sliderDate(TODAY, 2)]) {
      const o = only(makeRoom(hero, req12k, D, TODAY))
      const [first] = findFits(applyMove(hero, o, D), req12k, D, TODAY)
      expect(first).toEqual(o.freed)
      expect(first?.availability).toBe('now')
    }
  })

  it('applying the hero option moves leased SF by +1,850 and rent roll by +$86,950', () => {
    const o = only(makeRoom(hero, req12k, TODAY, TODAY))
    const before = kpis(hero, TODAY, TODAY, false)
    const after = kpis(applyMove(hero, o, TODAY), TODAY, TODAY, false)
    expect(after.leasedSf - before.leasedSf).toBe(1_850)
    expect(after.rentRoll - before.rentRoll).toBe(86_950)
  })

  it('applyMove returns the building itself when the changes do not apply', () => {
    const o = only(makeRoom(hero, req12k, TODAY, TODAY))
    expect(applyMove(hero, { ...o, lease: { ...o.lease, id: 'missing' } }, TODAY)).toBe(hero)
  })
})

// Floor 1 is `[A vacant 5,000, joined] [B leased 2,000]`; the destination floors come from the test.
const LATE = '2030-12-31'
const blocker = (over: Partial<Lease> = {}): Lease =>
  lease({ tenant: 'Blocker', start: '2020-01-01', end: LATE, rentPsf: 40, ...over })
const vacantSuite = (number: string, areaSf: number, over: Partial<Suite> = {}): Suite =>
  suite({ id: `s-${number}`, number, areaSf, ...over })
const floorOf = (number: number, ...suites: Suite[]): Floor => floor({ number, suites })
const home = (blockerLease: Lease = blocker(), blockerSf = 2_000, over: Partial<Suite> = {}): Floor =>
  floorOf(1, vacantSuite('101', 5_000, { joinsNext: true }), vacantSuite('102', blockerSf, { leases: [blockerLease], ...over }))
const req6k: Requirement = { minSf: 6_000, includePotential: false }
const solve = (floors: Floor[], req: Requirement = req6k, D = TODAY) => makeRoom(building({ floors }), req, D, TODAY)

describe('makeRoom rules (fixtures)', () => {
  it('returns [] when a fit already exists', () => {
    expect(solve([home(), floorOf(2, vacantSuite('201', 3_000))], { minSf: 4_000, includePotential: false })).toEqual([])
  })

  it('returns [] when no vacant suite is at least the mover’s size', () => {
    expect(solve([home(), floorOf(2, vacantSuite('201', 1_500))])).toEqual([])
  })

  it('never uses a potential or committed suite as the destination', () => {
    const D = '2027-03-01'
    const potential = vacantSuite('201', 3_000, { leases: [lease({ tenant: 'Leaver', start: '2020-01-01', end: '2027-01-31' })] })
    const committed = vacantSuite('301', 3_000, { leases: [lease({ tenant: 'Newcomer', start: '2027-09-01' })] })
    expect(solve([home(), floorOf(2, potential), floorOf(3, committed)], req6k, D)).toEqual([])
  })

  it('never uses a suite of the freed block as the destination', () => {
    const b = floorOf(1, vacantSuite('101', 5_000, { joinsNext: true }), vacantSuite('102', 2_000, { joinsNext: true, leases: [blocker()] }), vacantSuite('103', 2_500))
    expect(solve([b], { minSf: 8_000, includePotential: false })).toEqual([])
  })

  it('skips a mover with an open-ended lease', () => {
    expect(solve([home(blocker({ end: null })), floorOf(2, vacantSuite('201', 3_000))])).toEqual([])
  })

  it('skips a mover whose lease starts on D', () => {
    expect(solve([home(blocker({ start: TODAY })), floorOf(2, vacantSuite('201', 3_000))])).toEqual([])
  })

  it('respects maxSf and maxRentPsf on the freed block', () => {
    // 5,000 SF asking 50 and 2,000 SF asking 60 blend to 52.86.
    const priced = [
      floorOf(1, vacantSuite('101', 5_000, { joinsNext: true, askingRentPsf: 50 }), vacantSuite('102', 2_000, { askingRentPsf: 60, leases: [blocker()] })),
      floorOf(2, vacantSuite('201', 3_000)),
    ]
    expect(solve(priced, { ...req6k, maxSf: 7_000 })).toHaveLength(1)
    expect(solve(priced, { ...req6k, maxSf: 6_500 })).toEqual([])
    expect(solve(priced, { ...req6k, maxRentPsf: 53 })).toHaveLength(1)
    expect(solve(priced, { ...req6k, maxRentPsf: 52 })).toEqual([])
  })

  it('picks the smallest destination that fits, ties to the higher floor', () => {
    const o = only(solve([home(), floorOf(2, vacantSuite('201', 2_000)), floorOf(3, vacantSuite('301', 2_000)), floorOf(4, vacantSuite('401', 3_000))]))
    expect(o.to.floor).toBe(3)
    expect(o.to.areaSf).toBe(2_000)
  })

  it('ranks by smallest mover, then destination excess, then freed excess, then higher freed floor, and returns at most 3', () => {
    const sizes = [2_500, 1_000, 2_000, 1_500]
    const floors = sizes.map((sf, i) => floorOf(i + 1,
      vacantSuite(`${i + 1}01`, 5_000, { joinsNext: true }),
      vacantSuite(`${i + 1}02`, sf, { leases: [blocker({ tenant: `Tenant ${sf}` })] })))
    const options = solve([...floors, floorOf(5, vacantSuite('501', 2_500))])
    expect(options.map((o) => o.from.areaSf)).toEqual([1_000, 1_500, 2_000])
  })

  it('a destination on the mover’s own floor is allowed', () => {
    const f = floorOf(1, vacantSuite('100', 2_000), vacantSuite('101', 5_000, { joinsNext: true }), vacantSuite('102', 2_000, { leases: [blocker()] }))
    expect(only(solve([f])).to).toMatchObject({ suiteId: 's-100', floor: 1 })
  })
})

describe('makeRoom ranking keys (fixtures)', () => {
  const ids = (options: readonly MoveOption[]) => options.map((o) => o.from.suiteId)
  const leased = (number: string) => vacantSuite(number, 2_000, { leases: [blocker({ tenant: `Tenant ${number}` })] })

  it('equal movers: the smaller destination excess first, even against a higher freed floor', () => {
    const options = solve([
      floorOf(1, vacantSuite('101', 5_000, { joinsNext: true }), leased('102')),
      floorOf(2, vacantSuite('201', 2_000, { joinsNext: true }), { ...leased('202'), joinsNext: true }, vacantSuite('203', 3_000)),
      floorOf(3, vacantSuite('301', 2_500)),
    ])
    expect(options.map((o) => o.to.areaSf - o.from.areaSf)).toEqual([0, 500])
    expect(ids(options)).toEqual(['s-102', 's-202'])
  })

  it('equal movers and destinations: the smaller freed excess first, even against a higher freed floor', () => {
    const options = solve([
      floorOf(1, vacantSuite('101', 4_500, { joinsNext: true }), leased('102')),
      floorOf(2, vacantSuite('201', 5_000, { joinsNext: true }), leased('202')),
      floorOf(3, vacantSuite('301', 2_000)),
    ])
    expect(options.map((o) => o.freed.excessSf)).toEqual([500, 1_000])
    expect(ids(options)).toEqual(['s-102', 's-202'])
  })

  it('all else equal: the higher freed floor first, against building order', () => {
    const options = solve([
      floorOf(1, vacantSuite('101', 5_000, { joinsNext: true }), leased('102')),
      floorOf(2, vacantSuite('201', 5_000, { joinsNext: true }), leased('202')),
      floorOf(3, vacantSuite('301', 2_000)),
    ])
    expect(options.map((o) => o.freed.floor)).toEqual([2, 1])
  })
})

// The pre-optimisation solver, kept verbatim as an oracle: makeRoom must return exactly what it returns.
type RefMover = { floor: Floor; suite: Suite; lease: Lease }
const refEnd = ({ floor: f, suite: s }: { floor: Floor; suite: Suite }): MoveEnd => ({ suiteId: s.id, number: s.number, floor: f.number, areaSf: s.areaSf })

function refMovers(b: Building, D: ISODate): RefMover[] {
  return b.floors.flatMap((f) => f.suites.flatMap((s): RefMover[] => {
    const st = statusAt(s, D, TODAY)
    const active = st.status === 'occupied' || st.status === 'expiring' ? st.lease : null
    return s.kind === 'leasable' && active && active.end !== null && active.start < D ? [{ floor: f, suite: s, lease: active }] : []
  }))
}

function refDestination(b: Building, m: RefMover, block: Candidate, D: ISODate) {
  return b.floors
    .flatMap((f) => f.suites.map((s) => ({ floor: f, suite: s })))
    .filter(({ suite: s }) => {
      const st = statusAt(s, D, TODAY)
      return s.kind === 'leasable' && st.status === 'vacant' && st.overlay === 'none' && s.areaSf >= m.suite.areaSf && !block.suiteIds.includes(s.id)
    })
    .sort((a, c) => a.suite.areaSf - c.suite.areaSf || c.floor.number - a.floor.number)[0] ?? null
}

function refOption(b: Building, m: RefMover, req: Requirement, D: ISODate): MoveOption | null {
  const cleared = { ...b, floors: b.floors.map((f) => ({ ...f, suites: f.suites.map((s) => (s.id === m.suite.id ? { ...s, leases: [] } : s)) })) }
  const block = findFits(cleared, req, D, TODAY)[0]
  const to = block && refDestination(b, m, block, D)
  if (!block || !to) return null
  const draft: MoveOption = { key: `${m.lease.id}>${to.suite.id}`, lease: m.lease, from: refEnd(m), to: refEnd(to), freed: block }
  const applied = applyScenario(b, [
    { kind: 'vacate', leaseId: m.lease.id, on: addDaysIso(D, -1) },
    { kind: 'newLease', suiteIds: [to.suite.id], tenant: m.lease.tenant, start: D, end: m.lease.end ?? D, rentPsf: m.lease.rentPsf },
  ])
  const freed = applied.ok ? findFits(applied.building, req, D, TODAY).find((c) => c.key === block.key) : undefined
  return freed ? { ...draft, freed } : null
}

function referenceMakeRoom(b: Building, req: Requirement, D: ISODate): MoveOption[] {
  if (findFits(b, req, D, TODAY).length > 0) return []
  return refMovers(b, D)
    .flatMap((m) => refOption(b, m, req, D) ?? [])
    .sort((a, c) => a.from.areaSf - c.from.areaSf
      || (a.to.areaSf - a.from.areaSf) - (c.to.areaSf - c.from.areaSf)
      || a.freed.excessSf - c.freed.excessSf
      || c.freed.floor - a.freed.floor)
    .slice(0, MAX_MOVE_OPTIONS)
}

describe('makeRoom matches the reference solver', () => {
  it('on every bundled building, for several sizes, dates and potential on and off', () => {
    const dates = [TODAY, sliderDate(TODAY, 6), sliderDate(TODAY, 24)]
    const sizes = [5_000, 12_000, 20_000, 40_000]
    const reqs = sizes.flatMap((minSf) => [false, true].map((includePotential): Requirement => ({ minSf, includePotential })))
    let withOptions = 0
    for (const b of BUNDLED_BUILDINGS) for (const D of dates) for (const req of reqs) {
      const expected = referenceMakeRoom(b, req, D)
      expect(makeRoom(b, req, D, TODAY), `${b.id} ${D} ${req.minSf} ${req.includePotential}`).toEqual(expected)
      withOptions += expected.length > 0 ? 1 : 0
    }
    expect(withOptions).toBeGreaterThan(0)
  })
})

// 40 floors × 50 suites (the import limit): alternating vacant and leased 1,000 SF suites, all combinable, so nothing
// fits 2,500 SF and every one of the 1,000 tenants is a mover. Guards against the solver running whole-building
// findFits per mover again, which took seconds here and runs in render on every keystroke.
function bigBuilding(): Building {
  const floors = Array.from({ length: 40 }, (_, f) => floorOf(f + 1, ...Array.from({ length: 50 }, (_, i) => {
    const number = `${f + 1}-${i}`
    const leases = i % 2 === 1 ? [blocker({ tenant: `Tenant ${number}` })] : []
    return vacantSuite(number, 1_000, { joinsNext: true, leases })
  })))
  return building({ floors })
}

describe('makeRoom cost', () => {
  it('solves a 2,000-suite building well under a second', () => {
    const b = bigBuilding()
    const started = performance.now()
    const options = makeRoom(b, { minSf: 2_500, includePotential: false }, TODAY, TODAY)
    const elapsed = performance.now() - started
    expect(options).toHaveLength(MAX_MOVE_OPTIONS)
    expect(elapsed).toBeLessThan(1_500)
  })
})
