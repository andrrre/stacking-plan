import { z } from 'zod'
import { isoDate } from './isoDate.js'

export const LeaseSchema = z.object({
  id: z.string().min(1),
  tenant: z.string().min(1).max(80),
  start: isoDate,
  end: isoDate.nullable(),
  rentPsf: z.number().nonnegative(),
  vacating: z.boolean().optional(),
}).refine((l) => l.end === null || l.end >= l.start, 'end before start')

type LeaseDates = { start: string; end: string | null }

/** Inclusive overlap; a null end is open-ended (infinite). */
function overlaps(a: LeaseDates, b: LeaseDates): boolean {
  const aStartsBeforeBEnds = b.end === null || a.start <= b.end
  const bStartsBeforeAEnds = a.end === null || b.start <= a.end
  return aStartsBeforeBEnds && bStartsBeforeAEnds
}

function noOverlaps(leases: readonly LeaseDates[]): boolean {
  return leases.every((a, i) => leases.slice(i + 1).every((b) => !overlaps(a, b)))
}

export const SuiteSchema = z.object({
  id: z.string().min(1),
  number: z.string().min(1),
  areaSf: z.number().int().positive(),
  kind: z.enum(['leasable', 'common']),
  name: z.string().max(60).optional(),
  askingRentPsf: z.number().positive().optional(),
  joinsNext: z.boolean(),
  leases: z.array(LeaseSchema),
})
  .refine((s) => s.kind === 'common' || s.askingRentPsf !== undefined, 'asking rent required')
  .refine((s) => noOverlaps(s.leases), 'overlapping leases')

export const FloorSchema = z.object({
  number: z.number().int(),
  suites: z.array(SuiteSchema).min(1),
})

export const BuildingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  address: z.string(),
  floors: z.array(FloorSchema).min(1),
})

export const ChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('renew'), leaseId: z.string(), newEnd: isoDate }),
  z.object({ kind: z.literal('vacate'), leaseId: z.string(), on: isoDate }),
  z.object({
    kind: z.literal('newLease'),
    suiteIds: z.array(z.string()).min(1),
    tenant: z.string().min(1).max(80),
    start: isoDate,
    end: isoDate,
    rentPsf: z.number().positive(),
  }),
])

export const CaveatSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('combine'), count: z.number().int().min(2) }),
  z.object({ kind: z.literal('assumesNoRenewal'), tenant: z.string(), leaseEnd: isoDate }),
])

export const CandidateSchema = z.object({
  key: z.string(), // suiteIds.join('+')
  suiteIds: z.array(z.string()).min(1),
  suiteNumbers: z.array(z.string()).min(1),
  floor: z.number().int(),
  totalSf: z.number(),
  excessSf: z.number(),
  blendedRentPsf: z.number(),
  availableFrom: isoDate,
  availability: z.enum(['now', 'potential']),
  caveats: z.array(CaveatSchema),
})

export const ShortlistEntrySchema = z.object({
  id: z.string(), // `${buildingId}|${asOf}|${candidate.key}|${whatIf ? 'w' : 'b'}`
  buildingId: z.string(),
  candidate: CandidateSchema,
  asOf: isoDate,
  whatIf: z.boolean(),
})
