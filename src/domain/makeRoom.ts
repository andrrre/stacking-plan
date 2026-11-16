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

/**
 * The block clearing the mover would free: the top fit with the mover's leases cleared. Nothing fits in the building,
 * so every fit after clearing lies on the mover's floor; ranking that floor alone gives the same first fit.
 */
function freedBlock(b: Building, m: Mover, req: Requirement, D: ISODate, today: ISODate): Candidate | undefined {
  const clear = (s: Suite): Suite => (s.id === m.suite.id ? { ...s, leases: [] } : s)
  return findFits({ ...b, floors: [{ ...m.floor, suites: m.floor.suites.map(clear) }] }, req, D, today)[0]
}

/** Firm vacant leasable suites on D: smallest first, ties to the higher floor, then building order. */
function vacantSpots(b: Building, D: ISODate, today: ISODate): Spot[] {
  return b.floors
    .flatMap((floor) => floor.suites.map((suite): Spot => ({ floor, suite })))
    .filter(({ suite }) => {
      const st = statusAt(suite, D, today)
      return suite.kind === 'leasable' && st.status === 'vacant' && st.overlay === 'none'
    })
    .sort((a, c) => a.suite.areaSf - c.suite.areaSf || c.floor.number - a.floor.number)
}

/** An unproven option: the freed block and the smallest spot at least the mover's size outside it. */
function draftFor(b: Building, m: Mover, spots: readonly Spot[], req: Requirement, D: ISODate, today: ISODate): MoveOption | null {
  const block = freedBlock(b, m, req, D, today)
  const to = block && spots.find(({ suite }) => suite.areaSf >= m.suite.areaSf && !block.suiteIds.includes(suite.id))
  if (!block || !to) return null
  return { key: `${m.lease.id}>${to.suite.id}`, lease: m.lease, from: endOf(m), to: endOf(to), freed: block }
}

/** The draft with `freed` as findFits returns it once the move is applied; null if the block is not among the fits. */
function prove(b: Building, draft: MoveOption, req: Requirement, D: ISODate, today: ISODate): MoveOption | null {
  const applied = applyScenario(b, moveChanges(draft, D))
  const freed = applied.ok ? findFits(applied.building, req, D, today).find((c) => c.key === draft.freed.key) : undefined
  return freed ? { ...draft, freed } : null
}

/** smallest mover → smallest destination excess → smallest freed excess → higher freed floor. */
function rank(a: MoveOption, b: MoveOption): number {
  return a.from.areaSf - b.from.areaSf
    || (a.to.areaSf - a.from.areaSf) - (b.to.areaSf - b.from.areaSf)
    || a.freed.excessSf - b.freed.excessSf
    || b.freed.floor - a.freed.floor
}

/**
 * Up to MAX_MOVE_OPTIONS one-tenant moves that create a fit for `req` on D; [] when a fit already exists.
 * Drafts are ranked, then proven in that order until enough pass. A proof keeps the draft's suites, so the excess and
 * floor, hence every rank key, are unchanged; the stable sort gives the order that proving every draft would.
 */
export function makeRoom(b: Building, req: Requirement, D: ISODate, today: ISODate): MoveOption[] {
  if (findFits(b, req, D, today).length > 0) return []
  const spots = vacantSpots(b, D, today)
  const drafts = movers(b, D, today).flatMap((m) => draftFor(b, m, spots, req, D, today) ?? []).sort(rank)
  return drafts.reduce<MoveOption[]>((proven, draft) => {
    if (proven.length >= MAX_MOVE_OPTIONS) return proven
    const option = prove(b, draft, req, D, today)
    return option ? [...proven, option] : proven
  }, [])
}
