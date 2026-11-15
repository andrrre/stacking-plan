import { addDaysIso } from '../../domain/dates'
import { formatMmYyyy } from '../../domain/format'
import type { Building, ISODate, Lease, StatusResult, Suite } from '../../domain/types'

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
