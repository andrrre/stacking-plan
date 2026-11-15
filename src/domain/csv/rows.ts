import { formatNumber } from '../format'
import { LIMITS } from './limits'
import { parseBool, parseDate, parseInteger, parseMoney, type Parsed } from './values'
import type { ColumnIndex } from './header'
import type { CsvRecord } from './tokenize'
import type { CsvColumn, CsvError, ISODate } from '../types'

export type SuiteFields = { areaSf: number; kind: 'leasable' | 'common'; askingRentPsf?: number; joinsNext: boolean }
export type LeaseFields = { tenant: string; start: ISODate; end: ISODate | null; rentPsf: number; vacating: boolean }
/** A data row whose cells are all valid on their own; cross-row rules are checked later. */
export type CsvRow = { row: number; building: string; floor: number; number: string; suite: SuiteFields; lease: LeaseFields | null }
export type RowResult = { ok: true; row: CsvRow } | { ok: false; errors: CsvError[] }

type Cells = Readonly<Record<CsvColumn, string>>

/** Collects one row's errors while reading its cells; local to a single validateRow call. */
class RowReader {
  readonly errors: CsvError[] = []
  constructor(readonly row: number, readonly cells: Cells) {}

  take<T>(column: CsvColumn, parsed: Parsed<T>): T | undefined {
    if (parsed.ok) return parsed.value
    this.error(column, parsed.message)
    return undefined
  }

  error(column: CsvColumn, message: string): undefined {
    this.errors.push({ row: this.row, column, message })
    return undefined
  }
}

export function isBlank(record: CsvRecord): boolean {
  return record.cells.every((c) => c.trim() === '')
}

function readKind(r: RowReader): SuiteFields['kind'] | undefined {
  const kind = r.cells.kind.toLowerCase()
  if (kind === 'leasable' || kind === 'common') return kind
  return r.error('kind', 'Kind must be "leasable" (space that can be let) or "common" (lobby, core, shared areas).')
}

function readAskingRent(r: RowReader, kind: SuiteFields['kind'] | undefined): number | undefined {
  const raw = r.cells.asking_rent_psf
  if (kind === 'common') {
    return raw === '' ? undefined : r.error('asking_rent_psf', 'A common suite has no asking rent. Clear this cell, or change kind to leasable.')
  }
  if (kind === undefined) return undefined
  return r.take('asking_rent_psf', parseMoney(raw, { min: 0.01, max: LIMITS.rentPsf.max }, 'Asking rent'))
}

function readSuite(r: RowReader): Partial<SuiteFields> {
  const kind = readKind(r)
  return {
    areaSf: r.take('area_sf', parseInteger(r.cells.area_sf, LIMITS.areaSf, 'Area (SF)')),
    kind,
    askingRentPsf: readAskingRent(r, kind),
    joinsNext: r.take('joins_next', parseBool(r.cells.joins_next)),
  }
}

/** A row without a tenant describes an empty suite, so its other lease cells must be empty. */
function checkNoLease(r: RowReader): null {
  const filled = (['lease_start', 'lease_end', 'rent_psf'] as const).filter((c) => r.cells[c] !== '')
  filled.forEach((c) => r.error(c, 'This row has no tenant. Enter the tenant, or clear this cell if the suite is empty.'))
  const vacating = r.take('vacating', parseBool(r.cells.vacating))
  if (vacating) r.error('vacating', 'This row has no tenant, so nobody can be vacating. Enter the tenant, or clear this cell.')
  return null
}

function readLeaseEnd(r: RowReader, start: ISODate | undefined): ISODate | null | undefined {
  if (r.cells.lease_end === '') return null
  const end = r.take('lease_end', parseDate(r.cells.lease_end, 'Lease end'))
  if (end !== undefined && start !== undefined && end < start) {
    return r.error('lease_end', `The lease ends (${end}) before it starts (${start}). Check both dates.`)
  }
  return end
}

function readLease(r: RowReader, kind: SuiteFields['kind'] | undefined): LeaseFields | null | undefined {
  const tenant = r.cells.tenant
  if (tenant === '') return checkNoLease(r)
  if (kind === 'common') return r.error('tenant', 'A common suite cannot have a lease. Change kind to leasable, or clear the lease cells.')
  if (tenant.length > LIMITS.tenant) return r.error('tenant', `The tenant name is longer than ${LIMITS.tenant} characters. Shorten it.`)
  const start = r.take('lease_start', parseDate(r.cells.lease_start, 'Lease start'))
  const end = readLeaseEnd(r, start)
  const rentPsf = r.take('rent_psf', parseMoney(r.cells.rent_psf, LIMITS.rentPsf, 'Lease rent'))
  const vacating = r.take('vacating', parseBool(r.cells.vacating))
  if (vacating && end === null) {
    r.error('vacating', 'A lease with no end date cannot be vacating. Enter lease_end, or set vacating to no.')
  }
  if (start === undefined || end === undefined || rentPsf === undefined || vacating === undefined) return undefined
  return { tenant, start, end, rentPsf, vacating }
}

function readBuildingName(r: RowReader): string | undefined {
  const name = r.cells.building
  if (name === '') return r.error('building', 'The building name is empty. Enter it on every row.')
  if (name.length > LIMITS.buildingName) {
    return r.error('building', `The building name is longer than ${LIMITS.buildingName} characters. Shorten it.`)
  }
  return name
}

function readSuiteNumber(r: RowReader): string | undefined {
  if (LIMITS.suiteNumber.test(r.cells.suite)) return r.cells.suite
  return r.error('suite', 'The suite number must be 1 to 20 letters, digits, spaces or . # / & - and start with a letter, digit or #, e.g. 300, 3A or Suite 300.')
}

function readPlace(r: RowReader): { building?: string; floor?: number; number?: string } {
  return {
    building: readBuildingName(r),
    floor: r.take('floor', parseInteger(r.cells.floor, LIMITS.floor, 'Floor')),
    number: readSuiteNumber(r),
  }
}

/** Reads one data row; every problem in it is reported, not just the first. */
export function validateRow(record: CsvRecord, index: ColumnIndex): RowResult {
  const width = Object.keys(index).length
  if (record.cells.length !== width) {
    const message = `This row has ${formatNumber(record.cells.length)} cells but the header has ${width}. Check for a missing or extra comma.`
    return { ok: false, errors: [{ row: record.row, column: null, message }] }
  }
  const cells = Object.fromEntries(Object.entries(index).map(([c, i]) => [c, (record.cells[i] ?? '').trim()])) as Cells
  const r = new RowReader(record.row, cells)
  const place = readPlace(r)
  const suite = readSuite(r)
  const lease = readLease(r, suite.kind)
  if (r.errors.length > 0) return { ok: false, errors: r.errors }
  return { ok: true, row: { row: record.row, ...(place as Required<typeof place>), suite: suite as SuiteFields, lease: lease ?? null } }
}
