import type { BuildingGroup, SuiteGroup } from './crossRows'
import type { Building, Floor, Lease, Suite } from '../types'

const SLUG_MAX = 40
const FALLBACK_SLUG = 'building'

/** Lower-case ASCII letters and digits joined by single hyphens; accents are dropped. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, '')
  return slug === '' ? FALLBACK_SLUG : slug
}

/** `base`, or `base-2`, `base-3`, … whichever is not taken yet, with the suffix number used (null for none). */
export function uniqueId(base: string, taken: ReadonlySet<string>): { id: string; suffix: number | null } {
  if (!taken.has(base)) return { id: base, suffix: null }
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return { id: `${base}-${n}`, suffix: n }
}

/** Leases in start order; ids derive from the suite id (always `csv-…`, so never `scn-…`). */
function buildSuite(buildingId: string, g: SuiteGroup): Suite {
  const id = `${buildingId}-${g.floor}-${g.slug}`
  const first = g.first.suite
  const leases: Lease[] = g.rows
    .flatMap((r) => (r.lease ? [r.lease] : []))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
    .map((l, i) => ({ id: `${id}-l${i + 1}`, tenant: l.tenant, start: l.start, end: l.end, rentPsf: l.rentPsf, vacating: l.vacating }))
  return {
    id,
    number: g.number,
    areaSf: first.areaSf,
    kind: first.kind,
    ...(first.askingRentPsf !== undefined && { askingRentPsf: first.askingRentPsf }),
    joinsNext: first.joinsNext,
    leases,
  }
}

/** Floors descending; suites left to right in the order they first appear in the file. */
function buildFloors(buildingId: string, suites: readonly SuiteGroup[]): Floor[] {
  const numbers = [...new Set(suites.map((g) => g.floor))].sort((a, b) => b - a)
  return numbers.map((number) => ({
    number,
    suites: suites.filter((g) => g.floor === number).map((g) => buildSuite(buildingId, g)),
  }))
}

/**
 * One Building per group, with ids `csv-{slug}` made unique against `existingIds` and each other. A suffixed id
 * also numbers the name ("Bayfront Commons (2)"), so the switcher never lists two entries that look the same.
 */
export function assembleBuildings(groups: readonly BuildingGroup[], existingIds: readonly string[]): Building[] {
  return groups.reduce<{ taken: ReadonlySet<string>; out: Building[] }>((acc, g) => {
    const { id, suffix } = uniqueId(`csv-${slugify(g.name)}`, acc.taken)
    const name = suffix === null ? g.name : `${g.name} (${suffix})`
    const building: Building = { id, name, address: '', floors: buildFloors(id, g.suites) }
    return { taken: new Set([...acc.taken, id]), out: [...acc.out, building] }
  }, { taken: new Set(existingIds), out: [] }).out
}
