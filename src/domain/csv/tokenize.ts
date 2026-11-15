import { formatNumber } from '../format'
import type { CsvError } from '../types'

/** One spreadsheet row: `row` counts records (header = 1), so a newline inside quotes does not shift it. */
export type CsvRecord = { row: number; cells: string[] }
export type TokenizeResult = { ok: true; records: CsvRecord[] } | { ok: false; error: CsvError }

type Field = { ok: true; value: string; end: number } | { ok: false; message: string }

const isRecordEnd = (ch: string | undefined) => ch === undefined || ch === '\n' || ch === '\r'

/** A quoted field; `start` is the opening quote. `""` inside is one quote; commas and newlines are literal. */
function readQuoted(text: string, start: number): Field {
  let value = ''
  let i = start + 1
  for (;;) {
    const q = text.indexOf('"', i)
    if (q === -1) {
      return { ok: false, message: 'A cell that starts with a quote mark (") is never closed. Check for a missing closing quote.' }
    }
    value += text.slice(i, q)
    if (text[q + 1] !== '"') return { ok: true, value, end: q + 1 }
    value += '"'
    i = q + 2
  }
}

function readUnquoted(text: string, start: number): Field {
  let i = start
  while (i < text.length && text[i] !== ',' && !isRecordEnd(text[i])) i++
  return { ok: true, value: text.slice(start, i), end: i }
}

function readField(text: string, start: number): Field {
  if (text[start] !== '"') return readUnquoted(text, start)
  const f = readQuoted(text, start)
  if (f.ok && text[f.end] !== ',' && !isRecordEnd(text[f.end])) {
    return { ok: false, message: 'There is text after a closing quote mark ("). Put the whole cell inside the quotes.' }
  }
  return f
}

function skipNewline(text: string, i: number): number {
  return text[i] === '\r' && text[i + 1] === '\n' ? i + 2 : i + 1
}

/**
 * RFC 4180 records: quoted fields, escaped quotes, commas and newlines inside quotes, CRLF or LF,
 * one trailing newline. Stops with an error once more than `maxRecords` records are read.
 */
export function tokenizeCsv(text: string, maxRecords: number): TokenizeResult {
  const records: CsvRecord[] = []
  let cells: string[] = []
  let i = 0
  while (i < text.length) {
    const row = records.length + 1
    const field = readField(text, i)
    if (!field.ok) return { ok: false, error: { row, column: null, message: field.message } }
    cells.push(field.value) // local buffer: copying per field would be quadratic on a hostile one-row file
    i = field.end
    if (text[i] === ',') {
      i++
      if (i < text.length) continue
      cells.push('')
    }
    records.push({ row, cells })
    cells = []
    if (records.length > maxRecords) {
      const message = `The file has more than ${formatNumber(maxRecords)} rows, counting empty ones. Delete the empty rows or split the file.`
      return { ok: false, error: { row: records.length, column: null, message } }
    }
    i = skipNewline(text, i)
  }
  return { ok: true, records }
}
