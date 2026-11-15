import { BuildingSchema } from '../../shared/domain.schema'
import { assembleBuildings } from './assemble'
import { crossRowErrors, groupRows } from './crossRows'
import { formatNumber } from '../format'
import { dropEmptyTrailingColumns, EXPECTED_COLUMNS, looksLikeHeader, mapHeader, type ColumnIndex } from './header'
import { CSV_COLUMNS, FILE_ROW, MAX_BYTES, MAX_RECORDS, MAX_ROWS, TOO_BIG_MESSAGE } from './limits'
import { isBlank, validateRow, type CsvRow } from './rows'
import { tokenizeCsv, type CsvRecord } from './tokenize'
import type { Building, CsvError, CsvResult } from '../types'

const NOT_CSV = 'This file is not a plain-text CSV (it may be an Excel workbook). '
  + 'In Excel use File › Save As › CSV UTF-8; in Google Sheets use File › Download › Comma-separated values.'
const NOT_UTF8 = 'The file is not saved as UTF-8 (accented letters could not be read). In Excel use File › Save As › CSV UTF-8.'
const NOT_HEADER = `The first row must be the header: ${EXPECTED_COLUMNS}. Delete any title rows above it.`
const TOO_MANY_ROWS = `The file has more than ${formatNumber(MAX_ROWS)} rows below the header. Split it into smaller files.`

const fail = (errors: CsvError[]): CsvResult => ({ ok: false, errors })
const fileError = (message: string): CsvResult => fail([{ row: FILE_ROW, column: null, message }])

/** NUL or another control character (tab, CR and LF aside): a binary file such as a workbook, not a CSV. */
function hasControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) return true
  }
  return false
}

const byteLength = (text: string) => new TextEncoder().encode(text).length

function byRowThenColumn(a: CsvError, b: CsvError): number {
  const col = (e: CsvError) => (e.column === null ? -1 : CSV_COLUMNS.indexOf(e.column))
  return a.row - b.row || col(a) - col(b)
}

/** Every imported building must also satisfy the shared schema; a failure is reported, never thrown. */
function checkSchema(buildings: readonly Building[]): CsvResult {
  const errors = buildings.flatMap((b): CsvError[] => {
    const r = BuildingSchema.safeParse(b)
    if (r.success) return []
    const detail = r.error.issues[0]?.message ?? 'invalid data'
    return [{ row: FILE_ROW, column: null, message: `"${b.name}" could not be imported (${detail}). Check its rows against the template.` }]
  })
  return errors.length > 0 ? fail(errors) : { ok: true, buildings: [...buildings] }
}

type Table = { index: ColumnIndex; records: CsvRecord[] }

/** Blank rows before the header are skipped; blank data rows are dropped and do not count toward MAX_ROWS. */
function readTable(text: string): Table | CsvError[] {
  const tokens = tokenizeCsv(text, MAX_RECORDS)
  if (!tokens.ok) return [tokens.error]
  const start = tokens.records.findIndex((r) => !isBlank(r))
  const first = tokens.records[start]
  if (!first) return [{ row: 1, column: null, message: 'The file is empty. Start from the template.' }]
  if (!looksLikeHeader(first.cells)) return [{ row: FILE_ROW, column: null, message: NOT_HEADER }]
  const { header, body } = dropEmptyTrailingColumns(first, tokens.records.slice(start + 1))
  const head = mapHeader(header.cells, header.row)
  if (!head.ok) return head.errors
  const records = body.filter((r) => !isBlank(r))
  if (records.length === 0) return [{ row: header.row + 1, column: null, message: 'The file has a header but no rows. Add one row per lease.' }]
  const over = records[MAX_ROWS]
  if (over) return [{ row: over.row, column: null, message: TOO_MANY_ROWS }]
  return { index: head.index, records }
}

function parseRecords(text: string, existingIds: readonly string[]): CsvResult {
  const table = readTable(text)
  if (Array.isArray(table)) return fail(table)
  const results = table.records.map((r) => validateRow(r, table.index))
  const rows = results.flatMap((r): CsvRow[] => (r.ok ? [r.row] : []))
  const groups = groupRows(rows)
  const errors = [...results.flatMap((r) => (r.ok ? [] : r.errors)), ...crossRowErrors(groups)].sort(byRowThenColumn)
  if (errors.length > 0) return fail(errors)
  return checkSchema(assembleBuildings(groups, existingIds))
}

/**
 * Pure, total CSV import (spec A10): any problem rejects the whole file, and every problem is listed with its
 * spreadsheet row (header = 1, 0 = the whole file), column and a fix. Limits are checked before any heavy work.
 */
export function parseCsv(text: string, existingIds: readonly string[]): CsvResult {
  if (text.length > MAX_BYTES || byteLength(text) > MAX_BYTES) return fileError(TOO_BIG_MESSAGE)
  if (hasControlChars(text)) return fileError(NOT_CSV)
  if (text.includes('\uFFFD')) return fileError(NOT_UTF8)
  try {
    return parseRecords(text.replace(/^\uFEFF/, ''), existingIds)
  } catch {
    return fileError('The file could not be read. Start from the template and try again.')
  }
}
