import { formatNumber } from '../format'
import { CSV_COLUMNS } from './limits'
import { quoted } from './values'
import type { CsvRecord } from './tokenize'
import type { CsvColumn, CsvError } from '../types'

export type ColumnIndex = Readonly<Record<CsvColumn, number>>
export type HeaderResult = { ok: true; index: ColumnIndex } | { ok: false; errors: CsvError[] }

export const EXPECTED_COLUMNS = CSV_COLUMNS.join(', ')
/** A header far wider than the template is rejected whole, before any per-column work. */
const MAX_HEADER_CELLS = 4 * CSV_COLUMNS.length

const isColumn = (name: string): name is CsvColumn => (CSV_COLUMNS as readonly string[]).includes(name)
const normalise = (cell: string) => cell.trim().toLowerCase()

/** False for a title row such as "Rent roll 2026": none of its cells is an expected column name. */
export function looksLikeHeader(cells: readonly string[]): boolean {
  return cells.some((c) => isColumn(normalise(c)))
}

function lastFilled(cells: readonly string[]): number {
  for (let i = cells.length - 1; i >= 0; i--) if (cells[i]?.trim() !== '') return i
  return -1
}

/**
 * Drops trailing columns that are empty in the header and in every full-width row (spreadsheet exports often
 * add one). Rows of another width are left alone, so they still report a cell-count error.
 */
export function dropEmptyTrailingColumns(header: CsvRecord, body: readonly CsvRecord[]): { header: CsvRecord; body: CsvRecord[] } {
  const width = header.cells.length
  const full = body.filter((r) => r.cells.length === width)
  const keep = full.reduce((k, r) => Math.max(k, lastFilled(r.cells) + 1), lastFilled(header.cells) + 1)
  if (keep === width) return { header, body: [...body] }
  const trim = (r: CsvRecord): CsvRecord => (r.cells.length === width ? { row: r.row, cells: r.cells.slice(0, keep) } : r)
  return { header: trim(header), body: body.map(trim) }
}

function cellError(name: string, position: number, seen: readonly string[], row: number): CsvError | null {
  if (name === '') {
    return { row, column: null, message: `Column ${position + 1} of the header row has no name. Delete that column or name it. Expected columns: ${EXPECTED_COLUMNS}.` }
  }
  if (!isColumn(name)) {
    return { row, column: null, message: `${quoted(name)} is not a column this import knows. Rename or delete it. Expected columns: ${EXPECTED_COLUMNS}.` }
  }
  if (seen.includes(name)) {
    return { row, column: name, message: `The column "${name}" appears more than once in the header row. Keep one.` }
  }
  return null
}

/** The header row (at spreadsheet row `row`): names are trimmed and case-insensitive, in any order; every column exactly once. */
export function mapHeader(cells: readonly string[], row: number): HeaderResult {
  if (cells.length > MAX_HEADER_CELLS) {
    return { ok: false, errors: [{ row, column: null, message: `The header row has ${formatNumber(cells.length)} columns; this import expects ${CSV_COLUMNS.length}: ${EXPECTED_COLUMNS}.` }] }
  }
  const names = cells.map(normalise)
  const errors = names.flatMap((name, i) => {
    const e = cellError(name, i, names.slice(0, i), row)
    return e ? [e] : []
  })
  const missing = CSV_COLUMNS.filter((c) => !names.includes(c)).map((c): CsvError => ({
    row, column: c, message: `The header row is missing the column "${c}". Add it (it may be empty in every row).`,
  }))
  const all = [...errors, ...missing]
  if (all.length > 0) return { ok: false, errors: all }
  const index = Object.fromEntries(CSV_COLUMNS.map((c) => [c, names.indexOf(c)])) as Record<CsvColumn, number>
  return { ok: true, index }
}
