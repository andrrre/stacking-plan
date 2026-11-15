import { z } from 'zod'
import { isoDate } from './isoDate.js'

// Upper bounds keep a tampered localStorage or a hostile file from making every load slow.
const MAX_ID = 120
const MAX_SUITE_NUMBER = 20
const MAX_NAME = 80
const MAX_ADDRESS = 200
const MAX_FLOORS = 250
const MAX_SUITES_PER_FLOOR = 200
const MAX_LEASES_PER_SUITE = 2000
const MAX_CANDIDATE_SUITES = 50
const MAX_KEY = MAX_CANDIDATE_SUITES * (MAX_ID + 1)

const id = z.string().min(1).max(MAX_ID)

export const LeaseSchema = z.object({
  id,
  tenant: z.string().min(1).max(MAX_NAME),
  start: isoDate,
  end: isoDate.nullable(),
  rentPsf: z.number().nonnegative(),
  vacating: z.boolean().optional(),
}).refine((l) => l.end === null || l.end >= l.start, 'end before start')

type LeaseDates = { start: string; end: string | null }

/**
 * Inclusive overlap check in O(n log n); a null end is open-ended (infinite).
 * Sorted by start, a set of intervals is disjoint exactly when each one starts after the previous one ends
 * (each lease ends on or after its start, so the previous end is the running maximum).
 */
function noOverlaps(leases: readonly LeaseDates[]): boolean {
  const sorted = [...leases].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
  return sorted.every((b, i) => {
    const a = sorted[i - 1]
    return a === undefined || (a.end !== null && b.start > a.end)
  })
}

export const SuiteSchema = z.object({
  id,
  number: z.string().min(1).max(MAX_SUITE_NUMBER),
  areaSf: z.number().int().positive(),
  kind: z.enum(['leasable', 'common']),
  name: z.string().max(60).optional(),
  askingRentPsf: z.number().positive().optional(),
  joinsNext: z.boolean(),
  leases: z.array(LeaseSchema).max(MAX_LEASES_PER_SUITE),
})
  .refine((s) => s.kind === 'common' || s.askingRentPsf !== undefined, 'asking rent required')
  .refine((s) => noOverlaps(s.leases), 'overlapping leases')

export const FloorSchema = z.object({
  number: z.number().int(),
  suites: z.array(SuiteSchema).min(1).max(MAX_SUITES_PER_FLOOR),
})

export const BuildingSchema = z.object({
  id,
  name: z.string().min(1).max(MAX_NAME),
  address: z.string().max(MAX_ADDRESS),
  floors: z.array(FloorSchema).min(1).max(MAX_FLOORS),
})

export const ChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('renew'), leaseId: id, newEnd: isoDate }),
  z.object({ kind: z.literal('vacate'), leaseId: id, on: isoDate }),
  z.object({
    kind: z.literal('newLease'),
    suiteIds: z.array(id).min(1),
    tenant: z.string().min(1).max(MAX_NAME),
    start: isoDate,
    end: isoDate,
    rentPsf: z.number().positive(),
  }),
])

export const CaveatSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('combine'), count: z.number().int().min(2) }),
  z.object({ kind: z.literal('assumesNoRenewal'), tenant: z.string().max(MAX_NAME), leaseEnd: isoDate }),
])

export const CandidateSchema = z.object({
  key: z.string().max(MAX_KEY), // suiteIds.join('+')
  suiteIds: z.array(z.string().max(MAX_ID)).min(1).max(MAX_CANDIDATE_SUITES),
  suiteNumbers: z.array(z.string().max(MAX_SUITE_NUMBER)).min(1).max(MAX_CANDIDATE_SUITES),
  floor: z.number().int(),
  totalSf: z.number(),
  excessSf: z.number(),
  blendedRentPsf: z.number(),
  availableFrom: isoDate,
  availability: z.enum(['now', 'potential']), // 'now' = firm (no non-renewal assumed), not "available today"
  caveats: z.array(CaveatSchema),
})

export const ShortlistEntrySchema = z.object({
  id: z.string().max(MAX_ID + MAX_KEY + 16), // `${buildingId}|${asOf}|${candidate.key}|${whatIf ? 'w' : 'b'}`
  buildingId: z.string().max(MAX_ID),
  candidate: CandidateSchema,
  asOf: isoDate,
  whatIf: z.boolean(),
})
