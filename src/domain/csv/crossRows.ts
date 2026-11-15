import { suiteSlug } from './limits'
import type { CsvRow, LeaseFields, SuiteFields } from './rows'
import type { CsvColumn, CsvError } from '../types'

/**
 * Rows grouped by building (case-insensitive name), then by floor + suite id slug, in first-appearance order.
 * Two different numbers with one slug ("3.01", "3/01") land in one group and are reported as a duplicate.
 */
export type SuiteGroup = { floor: number; number: string; slug: string; first: CsvRow; rows: CsvRow[] }
export type BuildingGroup = { name: string; suites: SuiteGroup[] }

const SUITE_COLUMNS: ReadonlyArray<readonly [CsvColumn, keyof SuiteFields]> = [
  ['area_sf', 'areaSf'], ['kind', 'kind'], ['asking_rent_psf', 'askingRentPsf'], ['joins_next', 'joinsNext'],
]

export function groupRows(rows: readonly CsvRow[]): BuildingGroup[] {
  const buildings = new Map<string, { name: string; suites: Map<string, SuiteGroup> }>()
  rows.forEach((r) => {
    const key = r.building.toLowerCase()
    const b = buildings.get(key) ?? { name: r.building, suites: new Map<string, SuiteGroup>() }
    buildings.set(key, b)
    const slug = suiteSlug(r.number)
    const suiteKey = `${r.floor}|${slug}`
    const s = b.suites.get(suiteKey) ?? { floor: r.floor, number: r.number, slug, first: r, rows: [] }
    b.suites.set(suiteKey, { ...s, rows: [...s.rows, r] })
  })
  return [...buildings.values()].map((b) => ({ name: b.name, suites: [...b.suites.values()] }))
}

/** Inclusive overlap; a null end runs on forever. */
function overlaps(a: LeaseFields, b: LeaseFields): boolean {
  return (b.end === null || a.start <= b.end) && (a.end === null || b.start <= a.end)
}

const suiteLabel = (g: SuiteGroup) => `Suite ${g.number} on floor ${g.floor}`

function mismatchErrors(g: SuiteGroup, first: CsvRow, r: CsvRow): CsvError[] {
  return SUITE_COLUMNS.filter(([, key]) => first.suite[key] !== r.suite[key]).map(([column]) => ({
    row: r.row, column,
    message: `${suiteLabel(g)} has a different ${column} on row ${first.row}. Every row of one suite needs the same ${column}.`,
  }))
}

function sameIdError(g: SuiteGroup, first: CsvRow, r: CsvRow): CsvError[] {
  return [{
    row: r.row, column: 'suite',
    message: `Suite ${r.number} on floor ${g.floor} cannot be told apart from suite ${first.number} on row ${first.row}. Rename one of them.`,
  }]
}

function duplicateError(g: SuiteGroup, first: CsvRow, r: CsvRow): CsvError[] {
  if (first.lease !== null && r.lease !== null) return []
  return [{
    row: r.row, column: 'suite',
    message: `${suiteLabel(g)} is already listed on row ${first.row}. An empty suite needs exactly one row; a leased suite needs one row per lease.`,
  }]
}

function overlapError(g: SuiteGroup, r: CsvRow, earlier: readonly CsvRow[]): CsvError[] {
  const lease = r.lease
  const clash = lease && earlier.find((e) => e.lease && overlaps(e.lease, lease))
  if (!clash) return []
  return [{
    row: r.row, column: 'lease_start',
    message: `This lease overlaps the lease on row ${clash.row} for ${suiteLabel(g).toLowerCase()}. Leases on one suite cannot overlap; check the dates.`,
  }]
}

/** Rules across rows: one suite's rows agree on suite columns, no duplicate suite row, no overlapping leases. */
export function crossRowErrors(groups: readonly BuildingGroup[]): CsvError[] {
  return groups.flatMap((b) => b.suites.flatMap((g) => {
    return g.rows.slice(1).flatMap((r, i) => r.number !== g.first.number ? sameIdError(g, g.first, r) : [
      ...mismatchErrors(g, g.first, r),
      ...duplicateError(g, g.first, r),
      ...overlapError(g, r, g.rows.slice(0, i + 1)),
    ])
  }))
}
