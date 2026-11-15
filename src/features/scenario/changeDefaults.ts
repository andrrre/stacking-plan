import { addDaysIso, addMonthsIso } from '../../domain/dates'
import type { Candidate, Change, ISODate, Lease, Suite } from '../../domain/types'

// Prefills for the change dialog (spec A8, spec-technical §5.5).

const PROSPECT = 'Prospect'
const TERM_MONTHS = 60

/** Five-year term: start + 5 years − 1 day. */
export function fiveYearEnd(start: ISODate): ISODate {
  return addDaysIso(addMonthsIso(start, TERM_MONTHS), -1)
}

/** "Place tenant here": Prospect from D for five years at the blended asking rent on the candidate's suites. */
export function placeTenantChange(c: Candidate, asOf: ISODate): Change {
  return { kind: 'newLease', suiteIds: c.suiteIds, tenant: PROSPECT, start: asOf, end: fiveYearEnd(asOf), rentPsf: c.blendedRentPsf }
}

/** "Lease to prospect" on one suite, at its asking rent. */
export function leaseChange(s: Suite, asOf: ISODate): Change {
  return { kind: 'newLease', suiteIds: [s.id], tenant: PROSPECT, start: asOf, end: fiveYearEnd(asOf), rentPsf: s.askingRentPsf ?? 0 }
}

/** Renew for another five years after the current end; null for an open-ended lease (renew is not offered). */
export function renewChange(l: Lease): Change | null {
  return l.end === null ? null : { kind: 'renew', leaseId: l.id, newEnd: fiveYearEnd(addDaysIso(l.end, 1)) }
}

/** Vacate on the lease end, or on D when the lease is open-ended. */
export function vacateChange(l: Lease, asOf: ISODate): Change {
  return { kind: 'vacate', leaseId: l.id, on: l.end ?? asOf }
}
