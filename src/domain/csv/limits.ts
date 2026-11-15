import type { CsvColumn, CsvError } from '../types'

/** The template's column order; the header may list them in any order and any case. */
export const CSV_COLUMNS: readonly CsvColumn[] = [
  'building', 'floor', 'suite', 'area_sf', 'kind', 'asking_rent_psf', 'joins_next',
  'tenant', 'lease_start', 'lease_end', 'rent_psf', 'vacating',
]

/** 1 MB: checked on the File before reading it, and again on the text. */
export const MAX_BYTES = 1024 * 1024
export const TOO_BIG_MESSAGE = 'The file is larger than 1 MB. Split it into smaller files.'
/** Non-blank data rows below the header. */
export const MAX_ROWS = 2000
/** Hard cap on records of any kind (blank ones included), so the tokenizer stops early. */
export const MAX_RECORDS = 8000
export const MAX_SHOWN_ERRORS = 50

/** `row: 0` marks a problem with the whole file rather than one row. */
export const FILE_ROW = 0

export const LIMITS = {
  floor: { min: -10, max: 200 },
  areaSf: { min: 1, max: 1_000_000 },
  rentPsf: { min: 0, max: 1000 },
  buildingName: 80,
  tenant: 80,
  /** Display form as exported ("Suite 300", "3.01", "#300"); the id uses suiteSlug(number). */
  suiteNumber: /^[A-Za-z0-9#][A-Za-z0-9 .#/&-]{0,19}$/,
} as const

/** The suite's id part: every character outside [A-Za-z0-9-] becomes '-'. */
export function suiteSlug(number: string): string {
  return number.replace(/[^A-Za-z0-9-]/g, '-')
}

/** The first MAX_SHOWN_ERRORS errors, and how many more there are. */
export function splitErrors(errors: readonly CsvError[]): { shown: CsvError[]; hidden: number } {
  return { shown: errors.slice(0, MAX_SHOWN_ERRORS), hidden: Math.max(0, errors.length - MAX_SHOWN_ERRORS) }
}
