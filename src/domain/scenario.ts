import { formatLongDate } from './format'
import type { Building, Change, Floor, Lease, ScenarioError, ScenarioResult, Suite } from './types'

// A scenario is an ordered list of changes over a base building that is never mutated (spec A8, spec-technical §5.5).
// Every replace copies only the path building → floor → suite → leases; untouched floors and suites keep their identity.

type LeaseLocation = { floor: number; suite: Suite; lease: Lease }
type Code = ScenarioError['code']
type ChangeOf<K extends Change['kind']> = Extract<Change, { kind: K }>

const FOREVER = '9999-12-31'

/** Inclusive overlap; a null end is open-ended. */
function overlaps(a: Lease, b: Lease): boolean {
  return a.start <= (b.end ?? FOREVER) && b.start <= (a.end ?? FOREVER)
}

const termText = (l: Lease) =>
  l.end === null ? `from ${formatLongDate(l.start)} with no end date` : `${formatLongDate(l.start)} – ${formatLongDate(l.end)}`

export function findLease(b: Building, leaseId: string): LeaseLocation | null {
  for (const floor of b.floors) {
    for (const suite of floor.suites) {
      const lease = suite.leases.find((l) => l.id === leaseId)
      if (lease) return { floor: floor.number, suite, lease }
    }
  }
  return null
}

function replaceSuite(b: Building, next: Suite): Building {
  return {
    ...b,
    floors: b.floors.map((f) => (f.suites.some((s) => s.id === next.id)
      ? { ...f, suites: f.suites.map((s) => (s.id === next.id ? next : s)) }
      : f)),
  }
}

function replaceLease(b: Building, suite: Suite, next: Lease): Building {
  return replaceSuite(b, { ...suite, leases: suite.leases.map((l) => (l.id === next.id ? next : l)) })
}

const fail = (index: number, code: Code, message: string): ScenarioResult => ({ ok: false, error: { index, code, message } })
const notFound = (i: number, leaseId: string) => fail(i, 'leaseNotFound', `Lease ${leaseId} was not found.`)

function renew(b: Building, c: ChangeOf<'renew'>, i: number): ScenarioResult {
  const loc = findLease(b, c.leaseId)
  if (!loc) return notFound(i, c.leaseId)
  const { suite, lease } = loc
  if (lease.end === null) return fail(i, 'invalidDates', 'A lease with no end date cannot be renewed.')
  if (c.newEnd <= lease.end) {
    return fail(i, 'invalidDates', `The new end must be after the current end (${formatLongDate(lease.end)}).`)
  }
  const next: Lease = { ...lease, end: c.newEnd, vacating: false }
  const clash = suite.leases.find((l) => l.id !== next.id && overlaps(next, l))
  if (clash) return fail(i, 'overlap', `Overlaps ${clash.tenant} from ${formatLongDate(clash.start)}.`)
  return { ok: true, building: replaceLease(b, suite, next) }
}

function vacate(b: Building, c: ChangeOf<'vacate'>, i: number): ScenarioResult {
  const loc = findLease(b, c.leaseId)
  if (!loc) return notFound(i, c.leaseId)
  const { suite, lease } = loc
  if (c.on < lease.start || (lease.end !== null && c.on > lease.end)) {
    const bounds = lease.end === null
      ? `on or after ${formatLongDate(lease.start)}`
      : `between ${formatLongDate(lease.start)} and ${formatLongDate(lease.end)}`
    return fail(i, 'invalidDates', `The vacate date must be ${bounds}.`)
  }
  return { ok: true, building: replaceLease(b, suite, { ...lease, end: c.on, vacating: true }) }
}

type Placed = { suite: Suite; floor: Floor; index: number }

function locateSuite(b: Building, suiteId: string): Placed | null {
  for (const floor of b.floors) {
    const index = floor.suites.findIndex((s) => s.id === suiteId)
    const suite = floor.suites[index]
    if (suite) return { suite, floor, index }
  }
  return null
}

/** A8: one lease's suites are distinct, on one floor, consecutive, and joined at every boundary. Null when they are. */
function combineProblem(placed: readonly Placed[]): string | null {
  const ids = placed.map((p) => p.suite.id)
  const twice = placed.find((p, i) => ids.indexOf(p.suite.id) !== i)
  if (twice) return `Suite ${twice.suite.number} is listed twice.`
  const cannot = (a: Placed, b: Placed) => `Suites ${a.suite.number} and ${b.suite.number} cannot be combined.`
  const first = placed[0]
  const elsewhere = placed.find((p) => p.floor !== first?.floor)
  if (first && elsewhere) return cannot(first, elsewhere)
  const ordered = [...placed].sort((a, b) => a.index - b.index)
  for (let k = 1; k < ordered.length; k += 1) {
    const a = ordered[k - 1]
    const b = ordered[k]
    if (a && b && (b.index !== a.index + 1 || !a.suite.joinsNext)) return cannot(a, b)
  }
  return null
}

function newLease(base: Building, c: ChangeOf<'newLease'>, i: number): ScenarioResult {
  if (c.end < c.start) return fail(i, 'invalidDates', 'The lease end must not be before its start.')
  const placed: Placed[] = []
  for (const sid of c.suiteIds) {
    const p = locateSuite(base, sid)
    if (!p) return fail(i, 'suiteNotFound', `Suite ${sid} was not found.`)
    if (p.suite.kind !== 'leasable') return fail(i, 'notLeasable', `Suite ${p.suite.number} is not leasable.`)
    placed.push(p)
  }
  const problem = combineProblem(placed)
  if (problem) return fail(i, 'notLeasable', problem)
  let b = base
  for (const { suite: s } of placed) {
    const lease: Lease = { id: `scn-${i}-${s.id}`, tenant: c.tenant, start: c.start, end: c.end, rentPsf: c.rentPsf }
    const clash = s.leases.find((l) => overlaps(lease, l))
    if (clash) return fail(i, 'overlap', `Suite ${s.number} is leased to ${clash.tenant} ${termText(clash)}.`)
    const leases = [...s.leases, lease].sort((x, y) => x.start.localeCompare(y.start))
    b = replaceSuite(b, { ...s, leases })
  }
  return { ok: true, building: b }
}

function applyOne(b: Building, c: Change, i: number): ScenarioResult {
  switch (c.kind) {
    case 'renew': return renew(b, c, i)
    case 'vacate': return vacate(b, c, i)
    case 'newLease': return newLease(b, c, i)
  }
}

/** Applies the changes in order; the first failing change stops it with its index. No changes → the base itself. */
export function applyScenario(base: Building, changes: readonly Change[]): ScenarioResult {
  let b = base
  for (const [i, c] of changes.entries()) {
    const r = applyOne(b, c, i)
    if (!r.ok) return r
    b = r.building
  }
  return { ok: true, building: b }
}

/** Suites the scenario touches; empty when it does not apply (the app then shows the base building). */
export function modifiedSuiteIds(base: Building, changes: readonly Change[]): ReadonlySet<string> {
  const r = applyScenario(base, changes)
  if (!r.ok) return new Set()
  const ids = changes.flatMap((c) => (c.kind === 'newLease' ? c.suiteIds : [findLease(r.building, c.leaseId)?.suite.id ?? '']))
  return new Set(ids.filter((id) => id !== ''))
}
