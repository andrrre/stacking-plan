import { addDaysIso, addMonthsIso } from './dates.js'
import { EXPIRING_MONTHS, RISK_EDGES } from './constants.js'
import type { ISODate, Lease, RiskBucket, StatusResult, Suite } from './types.js'

// ISO strings compare lexically; every boundary is inclusive (spec-technical §5.1).

function isActive(l: Lease, D: ISODate): boolean {
  return l.start <= D && (l.end === null || D <= l.end)
}

function earliestFuture(leases: readonly Lease[], D: ISODate): Lease | undefined {
  return leases.filter((l) => l.start > D).reduce<Lease | undefined>((best, l) => (best && best.start <= l.start ? best : l), undefined)
}

function latestEnded(leases: readonly Lease[], D: ISODate): (Lease & { end: ISODate }) | undefined {
  return leases
    .filter((l): l is Lease & { end: ISODate } => l.end !== null && l.end < D)
    .reduce<(Lease & { end: ISODate }) | undefined>((best, l) => (best && best.end >= l.end ? best : l), undefined)
}

export function statusAt(s: Suite, D: ISODate, today: ISODate): StatusResult {
  if (s.kind === 'common') return { status: 'common' }

  const active = s.leases.find((l) => isActive(l, D)) // non-overlapping ⇒ at most one
  if (active) {
    if (active.end !== null && active.end <= addMonthsIso(D, EXPIRING_MONTHS)) return { status: 'expiring', lease: active }
    return { status: 'occupied', lease: active, openEnded: active.end === null }
  }

  const next = earliestFuture(s.leases, D)
  if (next) return { status: 'vacant', overlay: 'committed', nextLease: next } // committed wins over potential

  const last = latestEnded(s.leases, D)
  if (last && last.end >= today) {
    // Ended in [today, D): potential unless the tenant was confirmed leaving.
    const availableFrom = addDaysIso(last.end, 1)
    if (!last.vacating) return { status: 'vacant', overlay: 'potential', endedLease: last, availableFrom }
    return { status: 'vacant', overlay: 'none', availableFrom }
  }
  return { status: 'vacant', overlay: 'none', availableFrom: today }
}

export function riskBucket(s: Suite, D: ISODate, today: ISODate): RiskBucket {
  const st = statusAt(s, D, today)
  if (st.status === 'common' || st.status === 'vacant') return st.status
  const end = st.lease.end
  if (end === null) return 'openEnded'
  const edge = RISK_EDGES.find((m) => end <= addMonthsIso(D, m))
  return edge === undefined ? 'gt36' : `le${edge}`
}

export function isAvailable(s: Suite, st: StatusResult, includePotential: boolean): boolean {
  if (s.kind !== 'leasable' || st.status !== 'vacant') return false
  if (st.overlay === 'committed') return false
  return st.overlay !== 'potential' || includePotential
}
