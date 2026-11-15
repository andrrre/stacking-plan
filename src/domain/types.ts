import type { z } from 'zod'
import type {
  BuildingSchema, CandidateSchema, CaveatSchema, ChangeSchema, FloorSchema, LeaseSchema, ShortlistEntrySchema, SuiteSchema,
} from '../shared/domain.schema'
import type { ParsedQuerySchema } from '../shared/ask.schema'

export type ISODate = string

export type Lease = z.infer<typeof LeaseSchema>
export type Suite = z.infer<typeof SuiteSchema>
export type Floor = z.infer<typeof FloorSchema>
export type Building = z.infer<typeof BuildingSchema>
export type Change = z.infer<typeof ChangeSchema>
export type Caveat = z.infer<typeof CaveatSchema>
export type Candidate = z.infer<typeof CandidateSchema>
export type ShortlistEntry = z.infer<typeof ShortlistEntrySchema>
export type ParsedQuery = z.infer<typeof ParsedQuerySchema>

export type Requirement = { minSf: number; maxSf?: number; maxRentPsf?: number; includePotential: boolean }

export type Status = 'occupied' | 'expiring' | 'vacant' | 'common'

export type StatusResult =
  | { status: 'common' }
  | { status: 'occupied'; lease: Lease; openEnded: boolean }
  | { status: 'expiring'; lease: Lease } // lease.end !== null
  | { status: 'vacant'; overlay: 'none'; availableFrom: ISODate } // > today ⇒ label "Vacant from MM/YYYY"
  | { status: 'vacant'; overlay: 'potential'; endedLease: Lease; availableFrom: ISODate }
  | { status: 'vacant'; overlay: 'committed'; nextLease: Lease }

export type RiskBucket = 'common' | 'vacant' | 'le6' | 'le12' | 'le24' | 'le36' | 'gt36' | 'openEnded'

export type Block = { floor: number; suiteIds: string[]; totalSf: number }

export type KpiKey = 'occupancy' | 'vacant' | 'expiring' | 'largestBlock'

export type Kpis = {
  leasableSf: number
  leasedSf: number
  occupancyPct: number | null // 0..100, unrounded; null when leasableSf = 0
  vacantSf: number
  potentialSf: number // subset of vacant
  committedSf: number // subset of vacant
  expiringSf: number
  largestBlock: Block | null
  rentRoll: number // Σ areaSf × rentPsf, leases active on D
  ids: Record<KpiKey, string[]> // occupancy → leased suites
}

export type NoFitReason =
  | { kind: 'nothingAvailable' }
  | { kind: 'largestBlock'; block: Block }
  | { kind: 'spread'; totalSf: number; floorCount: number; blockCount: number }
  | { kind: 'filtered'; by: Array<'maxSf' | 'maxRentPsf'> }

export type NoFit = { reasons: NoFitReason[]; earliestFit: { date: ISODate; candidate: Candidate } | null }

export type ScenarioError = {
  index: number
  code: 'leaseNotFound' | 'suiteNotFound' | 'notLeasable' | 'invalidDates' | 'overlap'
  message: string
}
export type ScenarioResult = { ok: true; building: Building } | { ok: false; error: ScenarioError }

export type CsvColumn =
  | 'building' | 'floor' | 'suite' | 'area_sf' | 'kind' | 'asking_rent_psf' | 'joins_next'
  | 'tenant' | 'lease_start' | 'lease_end' | 'rent_psf' | 'vacating'
export type CsvError = { row: number /* file line, header = 1 */; column: CsvColumn | null; message: string }
export type CsvResult = { ok: true; buildings: Building[] } | { ok: false; errors: CsvError[] }
