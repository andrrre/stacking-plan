import type { FillKey } from '../../app/state/legendKeys'
import { maximalRuns } from '../../domain/blocks'
import { addDaysIso } from '../../domain/dates'
import { formatMmYyyy } from '../../domain/format'
import type { Building, Floor, ISODate, Lease, StatusResult, Suite } from '../../domain/types'

export type Located = { suite: Suite; floor: number; neighbours: Suite[] }

/** The suite, its floor number and the suites it can combine with (marked boundaries, left and right). */
export function locate(building: Building, suiteId: string): Located | null {
  for (const floor of building.floors) {
    const i = floor.suites.findIndex((s) => s.id === suiteId)
    const suite = floor.suites[i]
    if (!suite) continue
    const prev = floor.suites[i - 1]
    const next = floor.suites[i + 1]
    const joined = [...(prev?.joinsNext ? [prev] : []), ...(suite.joinsNext && next ? [next] : [])]
    const neighbours = suite.kind === 'leasable' ? joined.filter((n) => n.kind === 'leasable') : []
    return { suite, floor: floor.number, neighbours }
  }
  return null
}

export function combineText(neighbours: readonly Suite[]): string {
  return neighbours.length === 0 ? 'Cannot combine' : `Can combine with ${neighbours.map((n) => n.number).join(', ')}`
}

/** The lease active on D (occupied or expiring); null otherwise. */
export function shownLease(st: StatusResult): Lease | null {
  if (st.status === 'occupied' || st.status === 'expiring') return st.lease
  return null
}

/** A lease on notice leaves plain vacant space the day after it ends. */
function withVacating(text: string, lease: Lease): string {
  return lease.vacating && lease.end !== null ? `${text} · Vacant from ${formatMmYyyy(addDaysIso(lease.end, 1))}` : text
}

export function statusText(st: StatusResult, today: ISODate): string {
  switch (st.status) {
    case 'common': return 'Common area'
    case 'occupied': return withVacating('Occupied', st.lease)
    case 'expiring': return withVacating('Expiring', st.lease)
    case 'vacant':
      if (st.overlay === 'committed') return `Vacant · Leased from ${formatMmYyyy(st.nextLease.start)}`
      if (st.overlay === 'potential') return 'Potential · tenant may not renew'
      return st.availableFrom > today ? `Vacant from ${formatMmYyyy(st.availableFrom)}` : 'Vacant'
  }
}

export function monthsText(n: number): string {
  if (n < 1) return '< 1 month'
  return n === 1 ? '1 month' : `${n} months`
}

/** The availability status a suite's chip names (overlays included), in either colour mode. */
export function statusKey(st: StatusResult): FillKey {
  return st.status === 'vacant' && st.overlay !== 'none' ? st.overlay : st.status
}

/** The line under the title: who is in the suite, or what it is available as. */
export function tenantLine(suite: Suite, st: StatusResult): string {
  switch (st.status) {
    case 'common': return suite.name || 'Common area'
    case 'occupied':
    case 'expiring': return st.lease.tenant
    case 'vacant':
      if (st.overlay === 'potential') return `Potential availability · previously ${st.endedLease.tenant}`
      if (st.overlay === 'committed') return `Committed to ${st.nextLease.tenant}`
      return 'Available for lease'
  }
}

/** The Lease cell: "Ends MM/YYYY", "Ended MM/YYYY", "Starts MM/YYYY", "Available now", "No end date" or "—". */
export function leaseText(st: StatusResult, today: ISODate): string {
  switch (st.status) {
    case 'common': return '—'
    case 'occupied':
    case 'expiring': return st.lease.end === null ? 'No end date' : `Ends ${formatMmYyyy(st.lease.end)}`
    case 'vacant':
      if (st.overlay === 'potential') return `Ended ${formatMmYyyy(st.endedLease.end ?? st.availableFrom)}`
      if (st.overlay === 'committed') return `Starts ${formatMmYyyy(st.nextLease.start)}`
      return st.availableFrom > today ? `Available from ${formatMmYyyy(st.availableFrom)}` : 'Available now'
  }
}

/** SF of the contiguous available run (the KPI's block logic) the suite belongs to on its floor; null when it is not available. */
export function contiguousOnFloor(f: Floor, suiteId: string, D: ISODate, today: ISODate, includePotential: boolean): number | null {
  return maximalRuns(f, D, today, includePotential).find((r) => r.suiteIds.includes(suiteId))?.totalSf ?? null
}
