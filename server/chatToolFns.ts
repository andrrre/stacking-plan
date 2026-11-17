import { z } from 'zod'
import { caveatText } from '../src/domain/caveats.js'
import { MAX_RENT_PSF, MAX_REQ_SF, MAX_RESULTS, MIN_RENT_PSF, MIN_REQ_SF } from '../src/domain/constants.js'
import { addMonthsIso, snapToSlider } from '../src/domain/dates.js'
import { explainNoFit } from '../src/domain/explainNoFit.js'
import { findFits } from '../src/domain/findFits.js'
import { kpis } from '../src/domain/kpis.js'
import { statusAt } from '../src/domain/status.js'
import type { Block, Building, Candidate, ISODate, Lease, NoFitReason, StatusResult, Suite } from '../src/domain/types.js'
import { isoDate } from '../src/shared/isoDate.js'
import type { ChatContext } from './chatContext.js'

// The chat's read-only lookups (spec B4). Every figure the model may quote is computed and rounded here.

export const MAX_SUITES = 40
export const MAX_LEASES = 25
const MAX_EXPIRY_MONTHS = 60
const MAX_SUITE_NUMBER = 20

const reqSf = z.number().int().min(MIN_REQ_SF).max(MAX_REQ_SF)

export const BuildingOverviewInput = z.strictObject({})
export const ListSuitesInput = z.strictObject({
  status: z.enum(['vacant', 'expiring', 'occupied']).optional(),
  floor: z.number().int().optional(),
})
export const ExpiringLeasesInput = z.strictObject({ withinMonths: z.number().int().min(1).max(MAX_EXPIRY_MONTHS) })
export const FindSpaceInput = z
  .strictObject({
    minSf: reqSf,
    maxSf: reqSf.optional(),
    maxRentPsf: z.number().min(MIN_RENT_PSF).max(MAX_RENT_PSF).optional(),
    moveInBy: isoDate.optional(),
    includePotential: z.boolean().optional(),
  })
  .refine((r) => r.maxSf === undefined || r.maxSf >= r.minSf, { message: 'maxSf must not be below minSf', path: ['maxSf'] })
export const SuiteDetailsInput = z.strictObject({ suiteNumber: z.string().trim().min(1).max(MAX_SUITE_NUMBER) })

const round = (n: number, dp: number) => Number(n.toFixed(dp))

type Placed = { suite: Suite; floor: number; st: Exclude<StatusResult, { status: 'common' }> }

/** Leasable suites in floor order with their status at asOf; common areas are left out. */
function placedSuites(ctx: ChatContext): Placed[] {
  return ctx.building.floors.flatMap((f) => f.suites.flatMap((suite): Placed[] => {
    const st = statusAt(suite, ctx.asOf, ctx.today)
    return st.status === 'common' ? [] : [{ suite, floor: f.number, st }]
  }))
}

function suiteNumbersOf(b: Building, ids: readonly string[]): string[] {
  const numberOf = new Map(b.floors.flatMap((f) => f.suites).map((s) => [s.id, s.number]))
  return ids.map((id) => numberOf.get(id) ?? id)
}

export type BlockOut = { floor: number; suiteNumbers: string[]; totalSf: number }

const blockOut = (b: Building, block: Block): BlockOut =>
  ({ floor: block.floor, suiteNumbers: suiteNumbersOf(b, block.suiteIds), totalSf: block.totalSf })

// ---- building_overview ----

export type BuildingOverview = {
  name: string; floorCount: number; asOf: ISODate; scenario: boolean
  leasableSf: number; leasedSf: number; occupancyPct: number | null; vacantSf: number; potentialSf: number
  committedSf: number; uncommittedSf: number; expiringSf: number; expiringCount: number
  largestBlock: BlockOut | null; largestBlockIncludesPotential: true; rentRoll: number
}

/** The KPI tile's figures at asOf, potential space counted as the tile does (app default). */
export function buildingOverview(ctx: ChatContext): BuildingOverview {
  const b = ctx.building
  const k = kpis(b, ctx.asOf, ctx.today, true)
  return {
    name: b.name,
    floorCount: b.floors.length,
    asOf: ctx.asOf,
    scenario: ctx.scenario,
    leasableSf: k.leasableSf,
    leasedSf: k.leasedSf,
    occupancyPct: k.occupancyPct === null ? null : round(k.occupancyPct, 1),
    vacantSf: k.vacantSf,
    potentialSf: k.potentialSf,
    committedSf: k.committedSf,
    uncommittedSf: k.vacantSf - k.committedSf,
    expiringSf: k.expiringSf,
    expiringCount: k.expiringCount,
    largestBlock: k.largestBlock ? blockOut(b, k.largestBlock) : null,
    largestBlockIncludesPotential: true,
    rentRoll: round(k.rentRoll, 2),
  }
}

// ---- list_suites ----

export type SuiteRow = {
  number: string; floor: number; areaSf: number; status: 'vacant' | 'expiring' | 'occupied'
  overlay?: 'none' | 'potential' | 'committed'; tenant?: string; endingTenant?: string; leaseEnd?: ISODate
  committedFrom?: ISODate; askingRentPsf?: number; availableFrom?: ISODate
}
export type SuiteList = { total: number; shown: number; suites: SuiteRow[] }

function statusFields({ suite, st }: Placed): Omit<SuiteRow, 'number' | 'floor' | 'areaSf'> {
  if (st.status === 'occupied' || st.status === 'expiring') {
    return { status: st.status, tenant: st.lease.tenant, ...(st.lease.end !== null && { leaseEnd: st.lease.end }) }
  }
  const vacant = { status: st.status, overlay: st.overlay, askingRentPsf: suite.askingRentPsf }
  if (st.overlay === 'committed') return { ...vacant, committedFrom: st.nextLease.start }
  if (st.overlay === 'none') return { ...vacant, availableFrom: st.availableFrom }
  return { ...vacant, endingTenant: st.endedLease.tenant, availableFrom: st.availableFrom, ...(st.endedLease.end !== null && { leaseEnd: st.endedLease.end }) }
}

export function listSuites(ctx: ChatContext, input: z.infer<typeof ListSuitesInput>): SuiteList {
  const rows = placedSuites(ctx)
    .filter((p) => input.floor === undefined || p.floor === input.floor)
    .filter((p) => input.status === undefined || p.st.status === input.status)
    .map((p): SuiteRow => ({ number: p.suite.number, floor: p.floor, areaSf: p.suite.areaSf, ...statusFields(p) }))
  const suites = rows.slice(0, MAX_SUITES)
  return { total: rows.length, shown: suites.length, suites }
}

// ---- expiring_leases ----

export type LeaseRow = { suite: string; floor: number; tenant: string; areaSf: number; leaseEnd: ISODate; rentPsf: number }
export type ExpiringLeases = { until: ISODate; total: number; totalSf: number; shown: number; leases: LeaseRow[] }

/** Leases active on asOf that end on or before asOf + withinMonths (inclusive), soonest first. */
export function expiringLeases(ctx: ChatContext, input: z.infer<typeof ExpiringLeasesInput>): ExpiringLeases {
  const until = addMonthsIso(ctx.asOf, input.withinMonths)
  const rows = placedSuites(ctx)
    .flatMap(({ suite, floor, st }): LeaseRow[] => {
      if (st.status !== 'occupied' && st.status !== 'expiring') return []
      const { tenant, end, rentPsf } = st.lease
      return end !== null && end <= until ? [{ suite: suite.number, floor, tenant, areaSf: suite.areaSf, leaseEnd: end, rentPsf }] : []
    })
    .sort((a, b) => a.leaseEnd.localeCompare(b.leaseEnd))
  const leases = rows.slice(0, MAX_LEASES)
  return { until, total: rows.length, totalSf: rows.reduce((sum, r) => sum + r.areaSf, 0), shown: leases.length, leases }
}

// ---- find_space ----

export type SpaceCandidate = {
  suiteNumbers: string[]; floor: number; totalSf: number; excessSf: number; blendedRentPsf: number
  availableFrom: ISODate; availability: 'now' | 'potential'; caveats: string[]
}
export type ReasonOut = Exclude<NoFitReason, { kind: 'largestBlock' }> | { kind: 'largestBlock'; block: BlockOut }
export type SpaceSearch = {
  date: ISODate
  candidates: SpaceCandidate[]
  moreMayFit?: true
  reasons?: ReasonOut[]
  earliestFit?: { date: ISODate; candidate: SpaceCandidate } | null
}

const spaceCandidate = (c: Candidate): SpaceCandidate => ({
  suiteNumbers: c.suiteNumbers,
  floor: c.floor,
  totalSf: c.totalSf,
  excessSf: c.excessSf,
  blendedRentPsf: round(c.blendedRentPsf, 2),
  availableFrom: c.availableFrom,
  availability: c.availability,
  caveats: c.caveats.map((v) => caveatText(v, 'broker')),
})

/** findFits on the move-in date's slider step (or asOf); when nothing fits, explainNoFit's reasons and earliest fit. */
export function findSpace(ctx: ChatContext, input: z.infer<typeof FindSpaceInput>): SpaceSearch {
  const b = ctx.building
  const req = { minSf: input.minSf, maxSf: input.maxSf, maxRentPsf: input.maxRentPsf, includePotential: input.includePotential ?? true }
  const date = input.moveInBy === undefined ? ctx.asOf : snapToSlider(input.moveInBy, ctx.today)
  const fits = findFits(b, req, date, ctx.today)
  if (fits.length > 0) return { date, candidates: fits.map(spaceCandidate), ...(fits.length >= MAX_RESULTS && { moreMayFit: true as const }) }
  const nf = explainNoFit(b, req, date, ctx.today)
  return {
    date,
    candidates: [],
    reasons: nf.reasons.map((r) => (r.kind === 'largestBlock' ? { kind: r.kind, block: blockOut(b, r.block) } : r)),
    earliestFit: nf.earliestFit && { date: nf.earliestFit.date, candidate: spaceCandidate(nf.earliestFit.candidate) },
  }
}

// ---- suite_details ----

export type LeaseOut = { tenant: string; start: ISODate; end: ISODate | null; rentPsf: number; vacating?: boolean }
export type SuiteDetails =
  | { found: false }
  | {
    found: true; number: string; floor: number; kind: 'leasable' | 'common'; name?: string; areaSf: number
    askingRentPsf?: number; status: StatusResult['status']; overlay?: 'none' | 'potential' | 'committed'
    lease?: LeaseOut; endedLease?: LeaseOut; nextLease?: LeaseOut; availableFrom?: ISODate
    joinsPrevious: boolean; joinsNext: boolean
  }

const leaseOut = ({ tenant, start, end, rentPsf, vacating }: Lease): LeaseOut =>
  ({ tenant, start, end, rentPsf, ...(vacating !== undefined && { vacating }) })

function statusDetails(st: StatusResult) {
  switch (st.status) {
    case 'common': return { status: st.status }
    case 'occupied':
    case 'expiring': return { status: st.status, lease: leaseOut(st.lease) }
    case 'vacant':
      if (st.overlay === 'committed') return { status: st.status, overlay: st.overlay, nextLease: leaseOut(st.nextLease) }
      if (st.overlay === 'none') return { status: st.status, overlay: st.overlay, availableFrom: st.availableFrom }
      return { status: st.status, overlay: st.overlay, endedLease: leaseOut(st.endedLease), availableFrom: st.availableFrom }
  }
}

/** One suite by number (case-insensitive, first hit in floor order), with its status at asOf. */
export function suiteDetails(ctx: ChatContext, input: z.infer<typeof SuiteDetailsInput>): SuiteDetails {
  const wanted = input.suiteNumber.trim().toLowerCase()
  for (const f of ctx.building.floors) {
    const i = f.suites.findIndex((s) => s.number.toLowerCase() === wanted)
    const s = f.suites[i]
    if (!s) continue
    return {
      found: true,
      number: s.number,
      floor: f.number,
      kind: s.kind,
      ...(s.name !== undefined && { name: s.name }),
      areaSf: s.areaSf,
      ...(s.askingRentPsf !== undefined && { askingRentPsf: s.askingRentPsf }),
      ...statusDetails(statusAt(s, ctx.asOf, ctx.today)),
      joinsPrevious: f.suites[i - 1]?.joinsNext ?? false,
      joinsNext: s.joinsNext,
    }
  }
  return { found: false }
}
