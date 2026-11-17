// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { BUNDLED_BUILDINGS } from '../src/data/index.js'
import { caveatText } from '../src/domain/caveats.js'
import { addDaysIso, addMonthsIso, snapToSlider } from '../src/domain/dates.js'
import { explainNoFit } from '../src/domain/explainNoFit.js'
import { findFits } from '../src/domain/findFits.js'
import { MAX_RESULTS } from '../src/domain/constants.js'
import { kpis } from '../src/domain/kpis.js'
import { statusAt } from '../src/domain/status.js'
import { building, floor, lease, suite } from '../src/domain/testing/fixtures.js'
import type { Building, Candidate, ISODate, Requirement } from '../src/domain/types.js'
import type { ChatContext } from './chatContext.js'
import {
  buildingOverview, expiringLeases, ExpiringLeasesInput, findSpace, FindSpaceInput, ListSuitesInput, listSuites,
  MAX_LEASES, MAX_SUITES, suiteDetails, SuiteDetailsInput, type SpaceCandidate,
} from './chatToolFns.js'
import { chatTools, MAX_TOOL_CALLS, TOOL_BUDGET_TEXT } from './chatTools.js'

// building_overview wrapped in a spy that runs the real function, so a test can see whether a tool reached it.
vi.mock('./chatToolFns.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./chatToolFns.js')>()
  return { ...actual, buildingOverview: vi.fn(actual.buildingOverview) }
})

const TODAY = '2026-11-15'
const byId = (id: string) => BUNDLED_BUILDINGS.find((b) => b.id === id) as Building
const ODT = byId('odt')
const BSP = byId('bsp')

const ctxOf = (b: Building, asOf: ISODate = TODAY): ChatContext => ({ building: b, today: TODAY, asOf, scenario: false })
const ctx = ctxOf(ODT)

const leasable = (b: Building) => b.floors.flatMap((f) => f.suites.map((s) => ({ s, f }))).filter(({ s }) => s.kind === 'leasable')
const commonNumbers = (b: Building) => b.floors.flatMap((f) => f.suites).filter((s) => s.kind === 'common').map((s) => s.number)

const asSpace = (c: Candidate): SpaceCandidate => ({
  suiteNumbers: c.suiteNumbers,
  floor: c.floor,
  totalSf: c.totalSf,
  excessSf: c.excessSf,
  blendedRentPsf: Number(c.blendedRentPsf.toFixed(2)),
  availableFrom: c.availableFrom,
  availability: c.availability,
  caveats: c.caveats.map((v) => caveatText(v, 'broker')),
})

/**
 * One floor at MIXED_AS_OF: 101 potential (its lease ended after today, before the date), 102 committed (a lease
 * starts after the date), 103 occupied with an open-ended lease and joined to 104, 104 occupied until 2030.
 */
const MIXED_AS_OF = '2027-03-01'
const MIXED = building({
  floors: [floor({
    number: 3,
    suites: [
      suite({ number: '101', areaSf: 1200, askingRentPsf: 45, leases: [lease({ tenant: 'Ender Co', start: '2021-01-01', end: '2026-12-31', rentPsf: 41 })] }),
      suite({ number: '102', areaSf: 1500, askingRentPsf: 50, leases: [lease({ tenant: 'Future Co', start: '2027-06-01', end: '2032-05-31', rentPsf: 52 })] }),
      suite({ number: '103', areaSf: 800, joinsNext: true, leases: [lease({ tenant: 'Forever LLC', start: '2020-01-01', end: null, rentPsf: 38 })] }),
      suite({ number: '104', areaSf: 2000, askingRentPsf: 42, leases: [lease({ tenant: 'Long Co', start: '2021-01-01', end: '2030-12-31', rentPsf: 44 })] }),
    ],
  })],
})
const mixed = ctxOf(MIXED, MIXED_AS_OF)

describe('building_overview', () => {
  it('equals the KPI tile figures (potential space counted) at asOf', () => {
    const k = kpis(ODT, TODAY, TODAY, true)
    const o = buildingOverview(ctx)
    expect(o).toMatchObject({
      name: ODT.name,
      floorCount: ODT.floors.length,
      asOf: TODAY,
      scenario: false,
      leasableSf: k.leasableSf,
      leasedSf: k.leasedSf,
      vacantSf: k.vacantSf,
      potentialSf: k.potentialSf,
      committedSf: k.committedSf,
      expiringSf: k.expiringSf,
      expiringCount: k.expiringCount,
      largestBlockIncludesPotential: true,
    })
    expect(o.occupancyPct).toBe(Number((k.occupancyPct as number).toFixed(1)))
    expect(o.rentRoll).toBe(Number(k.rentRoll.toFixed(2)))
    expect(o.uncommittedSf).toBe(k.vacantSf - k.committedSf)
    expect(o).not.toHaveProperty('availableSf')
    expect(o.largestBlock).toEqual({
      floor: k.largestBlock?.floor,
      suiteNumbers: k.largestBlockSuiteNumbers,
      totalSf: k.largestBlock?.totalSf,
    })
  })

  it('uncommittedSf is vacant space less committed space, potential space included', () => {
    expect(buildingOverview(mixed)).toMatchObject({ vacantSf: 2700, potentialSf: 1200, committedSf: 1500, uncommittedSf: 1200 })
  })

  it('rounds occupancy to one decimal', () => {
    const pct = buildingOverview(ctx).occupancyPct as number
    expect(Math.round(pct * 10) / 10).toBe(pct)
  })

  it('has no largest block when nothing is vacant', () => {
    const full = building({ floors: [floor({ suites: [suite({ leases: [lease({ start: '2020-01-01', end: null })] })] })] })
    expect(buildingOverview(ctxOf(full)).largestBlock).toBeNull()
  })
})

describe('list_suites', () => {
  it('filters by status, every row matching statusAt', () => {
    const r = listSuites(ctx, { status: 'vacant' })
    const expected = leasable(ODT).filter(({ s }) => statusAt(s, TODAY, TODAY).status === 'vacant')
    expect(r.total).toBe(expected.length)
    expect(r.suites.map((x) => x.number)).toEqual(expected.map(({ s }) => s.number))
    expect(r.suites.every((x) => x.status === 'vacant')).toBe(true)
  })

  it('filters by floor', () => {
    const f = ODT.floors[1]?.number as number
    const r = listSuites(ctx, { floor: f })
    expect(r.suites.length).toBeGreaterThan(0)
    expect(r.suites.every((x) => x.floor === f)).toBe(true)
  })

  it('never lists common areas', () => {
    const common = commonNumbers(ODT)
    expect(common.length).toBeGreaterThan(0)
    const numbers = listSuites(ctx, {}).suites.map((x) => x.number)
    expect(numbers.filter((n) => common.includes(n))).toEqual([])
  })

  it(`caps the rows at ${MAX_SUITES} and reports the real count`, () => {
    const r = listSuites(ctxOf(BSP), {})
    expect(MAX_SUITES).toBe(40)
    expect(r.shown).toBe(40)
    expect(r.suites).toHaveLength(40)
    expect(r.total).toBe(leasable(BSP).length)
  })

  it('rows for each status and overlay carry exactly their own fields', () => {
    expect(listSuites(mixed, {})).toEqual({
      total: 4,
      shown: 4,
      suites: [
        { number: '101', floor: 3, areaSf: 1200, status: 'vacant', overlay: 'potential', askingRentPsf: 45, endingTenant: 'Ender Co', leaseEnd: '2026-12-31', availableFrom: '2027-01-01' },
        { number: '102', floor: 3, areaSf: 1500, status: 'vacant', overlay: 'committed', askingRentPsf: 50, committedFrom: '2027-06-01' },
        { number: '103', floor: 3, areaSf: 800, status: 'occupied', tenant: 'Forever LLC' },
        { number: '104', floor: 3, areaSf: 2000, status: 'occupied', tenant: 'Long Co', leaseEnd: '2030-12-31' },
      ],
    })
  })

  it('carries the tenant and lease end of a leased suite', () => {
    const r = listSuites(ctx, { status: 'occupied' })
    const row = r.suites[0]
    const { s } = leasable(ODT).find(({ s: x }) => x.number === row?.number) as { s: Building['floors'][number]['suites'][number] }
    const st = statusAt(s, TODAY, TODAY)
    if (st.status !== 'occupied') throw new Error('expected an occupied suite')
    expect(row?.tenant).toBe(st.lease.tenant)
  })
})

describe('expiring_leases', () => {
  it('within 12 months returns exactly the suites statusAt calls expiring, sorted by end date', () => {
    const r = expiringLeases(ctx, { withinMonths: 12 })
    const all = leasable(ODT).flatMap(({ s }) => {
      const st = statusAt(s, TODAY, TODAY)
      return st.status === 'expiring' ? [{ number: s.number, end: st.lease.end as string }] : []
    })
    const sorted = [...all].sort((a, b) => a.end.localeCompare(b.end))
    expect(all.length).toBeGreaterThan(0)
    expect(r.total).toBe(all.length)
    expect(r.leases.map((l) => l.suite)).toEqual(sorted.slice(0, MAX_LEASES).map((x) => x.number))
    expect(r.until).toBe(addMonthsIso(TODAY, 12))
  })

  it('sums totalSf over every match, not only the shown rows', () => {
    const r = expiringLeases(ctx, { withinMonths: 60 })
    const expected = leasable(ODT).filter(({ s }) => {
      const st = statusAt(s, TODAY, TODAY)
      return (st.status === 'expiring' || st.status === 'occupied') && st.lease.end !== null && st.lease.end <= addMonthsIso(TODAY, 60)
    })
    expect(r.total).toBe(expected.length)
    expect(r.totalSf).toBe(expected.reduce((sum, { s }) => sum + s.areaSf, 0))
    expect(r.shown).toBe(Math.min(expected.length, MAX_LEASES))
  })

  it('includes a lease ending exactly on asOf + n months and excludes one ending a day later', () => {
    const edge = addMonthsIso(TODAY, 6)
    const b = building({
      floors: [floor({
        suites: [
          suite({ id: 'in', number: '101', leases: [lease({ tenant: 'In', start: '2020-01-01', end: edge })] }),
          suite({ id: 'out', number: '102', leases: [lease({ tenant: 'Out', start: '2020-01-01', end: addDaysIso(edge, 1) })] }),
        ],
      })],
    })
    const r = expiringLeases(ctxOf(b), { withinMonths: 6 })
    expect(r.leases.map((l) => l.suite)).toEqual(['101'])
  })
})

describe('find_space', () => {
  const req = (minSf: number, includePotential = true): Requirement => ({ minSf, includePotential })

  it('returns the findFits candidates on asOf, rounded and with broker caveat text', () => {
    const r = findSpace(ctx, { minSf: 5000 })
    const fits = findFits(ODT, req(5000), TODAY, TODAY)
    expect(fits.length).toBeGreaterThan(0)
    expect(r.date).toBe(TODAY)
    expect(r.candidates).toEqual(fits.map(asSpace))
    expect(r.reasons).toBeUndefined()
  })

  it('rounds the blended rent to two decimals', () => {
    for (const c of findSpace(ctx, { minSf: 3000 }).candidates) {
      expect(Math.round(c.blendedRentPsf * 100) / 100).toBe(c.blendedRentPsf)
    }
  })

  it('moves the date to the slider step of moveInBy and repeats every caveat', () => {
    const moveInBy = '2028-06-20'
    const date = snapToSlider(moveInBy, TODAY)
    const r = findSpace(ctx, { minSf: 12000, moveInBy })
    const fits = findFits(ODT, req(12000), date, TODAY)
    expect(r.date).toBe(date)
    expect(r.candidates).toEqual(fits.map(asSpace))
    expect(r.candidates.flatMap((c) => c.caveats).length).toBeGreaterThan(0)
  })

  it('defaults includePotential to true', () => {
    const date = snapToSlider('2028-06-20', TODAY)
    const r = findSpace(ctx, { minSf: 12000, moveInBy: '2028-06-20' })
    const off = findSpace(ctx, { minSf: 12000, moveInBy: '2028-06-20', includePotential: false })
    expect(r.candidates).toEqual(findFits(ODT, req(12000, true), date, TODAY).map(asSpace))
    expect(off.candidates).toEqual(findFits(ODT, req(12000, false), date, TODAY).map(asSpace))
  })

  it(`marks a list cut at the domain's ${MAX_RESULTS} options with moreMayFit`, () => {
    expect(findFits(ODT, req(1000), TODAY, TODAY)).toHaveLength(MAX_RESULTS)
    expect(findSpace(ctx, { minSf: 1000 }).moreMayFit).toBe(true)
  })

  it('leaves moreMayFit out when fewer options fit', () => {
    const r = findSpace(mixed, { minSf: 1000 })
    expect(r.candidates.map((c) => c.suiteNumbers)).toEqual([['101']])
    expect(r).not.toHaveProperty('moreMayFit')
  })

  it('explains a requirement nothing fits, with the earliest fit', () => {
    const minSf = (kpis(ODT, TODAY, TODAY, true).largestBlock?.totalSf ?? 0) + 1
    const r = findSpace(ctx, { minSf })
    const nf = explainNoFit(ODT, req(minSf), TODAY, TODAY)
    expect(r.candidates).toEqual([])
    expect(r.reasons?.map((x) => x.kind)).toEqual(nf.reasons.map((x) => x.kind))
    const block = nf.reasons.find((x) => x.kind === 'largestBlock')
    const shown = r.reasons?.find((x) => x.kind === 'largestBlock')
    if (block?.kind !== 'largestBlock' || shown?.kind !== 'largestBlock') throw new Error('expected a largestBlock reason')
    expect(shown.block).toEqual({
      floor: block.block.floor,
      totalSf: block.block.totalSf,
      suiteNumbers: block.block.suiteIds.map((id) => ODT.floors.flatMap((f) => f.suites).find((s) => s.id === id)?.number),
    })
    expect(r.earliestFit).toEqual(nf.earliestFit && { date: nf.earliestFit.date, candidate: asSpace(nf.earliestFit.candidate) })
    expect(r.earliestFit).not.toBeNull()
  })
})

describe('suite_details', () => {
  it('returns the status, lease and joins of a known suite', () => {
    const { s, f } = leasable(ODT).find(({ s: x }) => statusAt(x, TODAY, TODAY).status === 'occupied') as ReturnType<typeof leasable>[number]
    const st = statusAt(s, TODAY, TODAY)
    if (st.status !== 'occupied') throw new Error('expected an occupied suite')
    const idx = f.suites.indexOf(s)
    const r = suiteDetails(ctx, { suiteNumber: s.number })
    expect(r).toMatchObject({
      found: true,
      number: s.number,
      floor: f.number,
      kind: 'leasable',
      areaSf: s.areaSf,
      status: 'occupied',
      lease: { tenant: st.lease.tenant, start: st.lease.start, end: st.lease.end, rentPsf: st.lease.rentPsf },
      joinsNext: s.joinsNext,
      joinsPrevious: idx > 0 ? f.suites[idx - 1]?.joinsNext : false,
    })
  })

  it('matches the suite number regardless of case', () => {
    const b = building({ floors: [floor({ suites: [suite({ number: '12A' })] })] })
    expect(suiteDetails(ctxOf(b), { suiteNumber: '12a' })).toMatchObject({ found: true, number: '12A' })
    expect(suiteDetails(ctxOf(b), { suiteNumber: '12A' })).toMatchObject({ found: true, number: '12A' })
  })

  it('a potential suite: the ended lease and the available-from date', () => {
    expect(suiteDetails(mixed, { suiteNumber: '101' })).toEqual({
      found: true, number: '101', floor: 3, kind: 'leasable', areaSf: 1200, askingRentPsf: 45, status: 'vacant', overlay: 'potential',
      endedLease: { tenant: 'Ender Co', start: '2021-01-01', end: '2026-12-31', rentPsf: 41 }, availableFrom: '2027-01-01',
      joinsPrevious: false, joinsNext: false,
    })
  })

  it('a committed suite: the next lease', () => {
    expect(suiteDetails(mixed, { suiteNumber: '102' })).toEqual({
      found: true, number: '102', floor: 3, kind: 'leasable', areaSf: 1500, askingRentPsf: 50, status: 'vacant', overlay: 'committed',
      nextLease: { tenant: 'Future Co', start: '2027-06-01', end: '2032-05-31', rentPsf: 52 },
      joinsPrevious: false, joinsNext: false,
    })
  })

  it('an open-ended lease, and joins on both sides of a joined pair', () => {
    expect(suiteDetails(mixed, { suiteNumber: '103' })).toEqual({
      found: true, number: '103', floor: 3, kind: 'leasable', areaSf: 800, askingRentPsf: 40, status: 'occupied',
      lease: { tenant: 'Forever LLC', start: '2020-01-01', end: null, rentPsf: 38 },
      joinsPrevious: false, joinsNext: true,
    })
    expect(suiteDetails(mixed, { suiteNumber: '104' })).toMatchObject({ joinsPrevious: true, joinsNext: false })
  })

  it('reports an unknown number as not found', () => {
    expect(suiteDetails(ctx, { suiteNumber: 'nope' })).toEqual({ found: false })
  })
})

describe('chatTools', () => {
  it('exposes exactly the five tools', () => {
    expect(Object.keys(chatTools(ctx)).sort()).toEqual(
      ['building_overview', 'expiring_leases', 'find_space', 'list_suites', 'suite_details'],
    )
  })

  it('the overview description names uncommittedSf and tells the model to answer vacancy with vacantSf', () => {
    const text = chatTools(ctx).building_overview.description ?? ''
    expect(text).not.toContain('availableSf')
    expect(text).toContain('uncommittedSf = vacantSf - committedSf')
    expect(text).toContain('For a vacancy or availability question, give vacantSf (the figure on the app\'s "Available" tile)')
  })

  it('rejects unknown keys in every input schema', () => {
    expect(ListSuitesInput.safeParse({ extra: 1 }).success).toBe(false)
    expect(ExpiringLeasesInput.safeParse({ withinMonths: 12, extra: 1 }).success).toBe(false)
    expect(FindSpaceInput.safeParse({ minSf: 1000, extra: 1 }).success).toBe(false)
    expect(SuiteDetailsInput.safeParse({ suiteNumber: '1200', extra: 1 }).success).toBe(false)
  })

  it('rejects out-of-range values', () => {
    expect(ExpiringLeasesInput.safeParse({ withinMonths: 0 }).success).toBe(false)
    expect(ExpiringLeasesInput.safeParse({ withinMonths: 61 }).success).toBe(false)
    expect(ExpiringLeasesInput.safeParse({ withinMonths: 60 }).success).toBe(true)
    expect(FindSpaceInput.safeParse({ minSf: 0 }).success).toBe(false)
    expect(FindSpaceInput.safeParse({ minSf: 5000, maxSf: 4000 }).success).toBe(false)
    expect(FindSpaceInput.safeParse({ minSf: 5000, maxSf: 5000 }).success).toBe(true)
    expect(SuiteDetailsInput.safeParse({ suiteNumber: '' }).success).toBe(false)
  })

  const opts = { toolCallId: 't', messages: [] } as never

  it(`answers the call after the ${MAX_TOOL_CALLS}th with the budget message, without running the lookup`, async () => {
    const spy = vi.mocked(buildingOverview)
    const tools = chatTools(ctx)
    spy.mockClear()
    for (let i = 0; i < MAX_TOOL_CALLS; i += 1) expect(await tools.building_overview.execute?.({}, opts)).toEqual(buildingOverview(ctx))
    spy.mockClear()
    expect(await tools.building_overview.execute?.({}, opts)).toEqual({ error: TOOL_BUDGET_TEXT })
    expect(spy).not.toHaveBeenCalled()
  })

  it('counts every tool against one budget per chatTools call, and a new call starts at zero', async () => {
    expect(MAX_TOOL_CALLS).toBe(6)
    expect(TOOL_BUDGET_TEXT).toBe('Tool budget for this question is used up. Answer with what you have.')
    const tools = chatTools(ctx)
    for (let i = 0; i < MAX_TOOL_CALLS; i += 1) await tools.suite_details.execute?.({ suiteNumber: 'nope' }, opts)
    expect(await tools.list_suites.execute?.({}, opts)).toEqual({ error: TOOL_BUDGET_TEXT })
    expect(await chatTools(ctx).list_suites.execute?.({}, opts)).toEqual(listSuites(ctx, {}))
  })

  it('runs a tool through its execute with the context', async () => {
    const tools = chatTools(ctx)
    const out = await tools.building_overview.execute?.({}, { toolCallId: 't1', messages: [] } as never)
    expect(out).toEqual(buildingOverview(ctx))
  })
})
