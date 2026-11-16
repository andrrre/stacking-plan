import { MAX_MOVE_OPTIONS } from './constants'
import { addDaysIso } from './dates'
import { findFits } from './findFits'
import { applyScenario } from './scenario'
import { statusAt } from './status'
import type { Building, Candidate, Change, Floor, ISODate, Lease, MoveEnd, MoveOption, Requirement, Suite } from './types'

// Make room: when nothing fits, move one tenant to a vacant suite so a contiguous block frees up. Every option is
// proven by applying its changes and running findFits again, so the freed block is exactly what the finder returns.

type Mover = { floor: Floor; suite: Suite; lease: Lease }
type Spot = { floor: Floor; suite: Suite }

const endOf = ({ floor, suite }: Spot): MoveEnd => ({ suiteId: suite.id, number: suite.number, floor: floor.number, areaSf: suite.areaSf })

/** Vacate the day before D, then the same tenant, rent and end in the destination from D. */
export function moveChanges(o: MoveOption, D: ISODate): [Change, Change] {
  return [
    { kind: 'vacate', leaseId: o.lease.id, on: addDaysIso(D, -1) },
    { kind: 'newLease', suiteIds: [o.to.suiteId], tenant: o.lease.tenant, start: D, end: o.lease.end ?? D, rentPsf: o.lease.rentPsf },
  ]
}

/** The building with the move applied; `b` itself if the changes do not apply. */
export function applyMove(b: Building, o: MoveOption, D: ISODate): Building {
  const r = applyScenario(b, moveChanges(o, D))
  return r.ok ? r.building : b
}

/** Leasable suites occupied or expiring on D under a lease that ends and began before D. */
function movers(b: Building, D: ISODate, today: ISODate): Mover[] {
  return b.floors.flatMap((floor) => floor.suites.flatMap((suite): Mover[] => {
    const st = statusAt(suite, D, today)
    const active = st.status === 'occupied' || st.status === 'expiring' ? st.lease : null
    return suite.kind === 'leasable' && active && active.end !== null && active.start < D ? [{ floor, suite, lease: active }] : []
  }))
}

function withoutLeases(b: Building, suiteId: string): Building {
  const clear = (s: Suite): Suite => (s.id === suiteId ? { ...s, leases: [] } : s)
  return { ...b, floors: b.floors.map((f) => ({ ...f, suites: f.suites.map(clear) })) }
}

/** The smallest firm vacant suite at least the mover's size and outside the freed block; ties to the higher floor. */
function destination(b: Building, m: Mover, block: Candidate, D: ISODate, today: ISODate): Spot | null {
  const spots = b.floors
    .flatMap((floor) => floor.suites.map((suite): Spot => ({ floor, suite })))
    .filter(({ suite }) => {
      const st = statusAt(suite, D, today)
      return suite.kind === 'leasable' && st.status === 'vacant' && st.overlay === 'none'
        && suite.areaSf >= m.suite.areaSf && !block.suiteIds.includes(suite.id)
    })
    .sort((a, c) => a.suite.areaSf - c.suite.areaSf || c.floor.number - a.floor.number)
  return spots[0] ?? null
}

function optionFor(b: Building, m: Mover, req: Requirement, D: ISODate, today: ISODate): MoveOption | null {
  const block = findFits(withoutLeases(b, m.suite.id), req, D, today)[0]
  const to = block && destination(b, m, block, D, today)
  if (!block || !to) return null
  const draft: MoveOption = { key: `${m.lease.id}>${to.suite.id}`, lease: m.lease, from: endOf(m), to: endOf(to), freed: block }
  const applied = applyScenario(b, moveChanges(draft, D))
  const freed = applied.ok ? findFits(applied.building, req, D, today).find((c) => c.key === block.key) : undefined
  return freed ? { ...draft, freed } : null
}

/** smallest mover → smallest destination excess → smallest freed excess → higher freed floor. */
function rank(a: MoveOption, b: MoveOption): number {
  return a.from.areaSf - b.from.areaSf
    || (a.to.areaSf - a.from.areaSf) - (b.to.areaSf - b.from.areaSf)
    || a.freed.excessSf - b.freed.excessSf
    || b.freed.floor - a.freed.floor
}

/** Up to MAX_MOVE_OPTIONS one-tenant moves that create a fit for `req` on D; [] when a fit already exists. */
export function makeRoom(b: Building, req: Requirement, D: ISODate, today: ISODate): MoveOption[] {
  if (findFits(b, req, D, today).length > 0) return []
  return movers(b, D, today)
    .flatMap((m) => optionFor(b, m, req, D, today) ?? [])
    .sort(rank)
    .slice(0, MAX_MOVE_OPTIONS)
}
