import { MAX_RESULTS } from './constants'
import { maxIso } from './dates'
import { isAvailable, statusAt } from './status'
import type { Building, Candidate, Caveat, Floor, ISODate, Requirement, StatusResult, Suite } from './types'

// spec-technical §5.2, spec.md A5. A candidate is one suite or a run of neighbouring suites on one floor that
// are all available on D, joined only across combinable boundaries, and minimal for the requirement.

type Slot = { suite: Suite; st: StatusResult; available: boolean }
type Ranked = { candidate: Candidate; position: number }

const sumSf = (run: readonly Slot[]) => run.reduce((sum, x) => sum + x.suite.areaSf, 0)

/** Σ(area × asking) ÷ Σ area, unrounded (rounded to 2 dp only for display). */
function blendedRent(run: readonly Slot[]): number {
  const total = sumSf(run)
  return run.reduce((sum, x) => sum + x.suite.areaSf * (x.suite.askingRentPsf ?? 0), 0) / total
}

function passesFilters(run: readonly Slot[], total: number, req: Requirement): boolean {
  if (req.maxSf !== undefined && total > req.maxSf) return false
  return req.maxRentPsf === undefined || blendedRent(run) <= req.maxRentPsf
}

/** The minimal run starting at `i`, or null. Longer runs from `i` are never minimal, so the first hit is the only one. */
function minimalRunFrom(slots: readonly Slot[], i: number, minSf: number): Slot[] | null {
  let run: Slot[] = []
  for (let j = i; j < slots.length; j++) {
    const slot = slots[j]
    if (!slot?.available) return null
    if (j > i && !slots[j - 1]?.suite.joinsNext) return null // a run breaks at the left suite's joinsNext = false
    run = [...run, slot]
    // The first j to reach the minimum: dropping the right end is already below it, so only the left end is checked.
    const total = sumSf(run)
    if (total < minSf) continue
    const leftDropped = total - (run[0]?.suite.areaSf ?? 0)
    return run.length === 1 || leftDropped < minSf ? run : null
  }
  return null
}

function caveatsFor(run: readonly Slot[]): Caveat[] {
  const combine: Caveat[] = run.length > 1 ? [{ kind: 'combine', count: run.length }] : []
  const noRenewal = run
    .flatMap((x) => (x.st.status === 'vacant' && x.st.overlay === 'potential'
      ? [{ kind: 'assumesNoRenewal' as const, tenant: x.st.endedLease.tenant, leaseEnd: x.st.endedLease.end ?? x.st.availableFrom }]
      : []))
    .sort((a, b) => a.leaseEnd.localeCompare(b.leaseEnd))
  return [...combine, ...noRenewal]
}

/** A suite's available-from date: max(today, day after its latest ended lease), as statusAt reports it. */
function availableFrom(st: StatusResult, today: ISODate): ISODate {
  return st.status === 'vacant' && st.overlay !== 'committed' ? st.availableFrom : today
}

function toCandidate(f: Floor, run: readonly Slot[], req: Requirement, today: ISODate): Candidate {
  const totalSf = sumSf(run)
  const potential = run.some((x) => x.st.status === 'vacant' && x.st.overlay === 'potential')
  const suiteIds = run.map((x) => x.suite.id)
  const [first, ...rest] = run.map((x) => availableFrom(x.st, today))
  return {
    key: suiteIds.join('+'),
    suiteIds,
    suiteNumbers: run.map((x) => x.suite.number),
    floor: f.number,
    totalSf,
    excessSf: totalSf - req.minSf,
    blendedRentPsf: blendedRent(run),
    availableFrom: maxIso(first ?? today, ...rest, today),
    availability: potential ? 'potential' : 'now',
    caveats: caveatsFor(run),
  }
}

function floorFits(f: Floor, req: Requirement, D: ISODate, today: ISODate): Ranked[] {
  const slots: Slot[] = f.suites.map((suite) => {
    const st = statusAt(suite, D, today)
    return { suite, st, available: isAvailable(suite, st, req.includePotential) }
  })
  return slots.flatMap((_, i): Ranked[] => {
    const run = minimalRunFrom(slots, i, req.minSf)
    return run && passesFilters(run, sumSf(run), req) ? [{ candidate: toCandidate(f, run, req, today), position: i }] : []
  })
}

/** firm before potential → smallest excess → fewest suites → higher floor → leftmost first suite. */
function rank(a: Ranked, b: Ranked): number {
  const x = a.candidate
  const y = b.candidate
  return (x.availability === 'now' ? 0 : 1) - (y.availability === 'now' ? 0 : 1)
    || x.excessSf - y.excessSf
    || x.suiteIds.length - y.suiteIds.length
    || y.floor - x.floor
    || a.position - b.position
}

/** Ranked, minimal fits for `req` on D; at most MAX_RESULTS. */
export function findFits(b: Building, req: Requirement, D: ISODate, today: ISODate): Candidate[] {
  return b.floors
    .flatMap((f) => floorFits(f, req, D, today))
    .sort(rank)
    .slice(0, MAX_RESULTS)
    .map((r) => r.candidate)
}

/** One available suite as a candidate on its own (excess 0), for adding it to the shortlist; null if not available. */
export function suiteCandidate(f: Floor, suite: Suite, D: ISODate, today: ISODate): Candidate | null {
  const st = statusAt(suite, D, today)
  if (!isAvailable(suite, st, true)) return null
  return toCandidate(f, [{ suite, st, available: true }], { minSf: suite.areaSf, includePotential: true }, today)
}
