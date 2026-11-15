import { isoDate } from '../../shared/isoDate'
import { formatNumber } from '../format'
import type { ISODate } from '../types'

/** One cell read into a value, or a message a non-technical person can act on. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string }

type Range = { readonly min: number; readonly max: number }

const TRUE_WORDS = ['true', 'yes', '1']
const FALSE_WORDS = ['false', 'no', '0', '']
const INTEGER = /^-?(\d+|\d{1,3}(,\d{3})+)(\.0+)?$/
const MONEY = /^\$?(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$/

const SHOWN_MAX = 40

const fail = (message: string): Parsed<never> => ({ ok: false, message })

/** A cell value quoted for a message, cut short so one bad cell cannot flood the error list. */
export function quoted(raw: string): string {
  return `"${raw.length > SHOWN_MAX ? `${raw.slice(0, SHOWN_MAX)}…` : raw}"`
}

/** true/false, yes/no, 1/0 in any case; empty is false. */
export function parseBool(raw: string): Parsed<boolean> {
  const word = raw.toLowerCase()
  if (TRUE_WORDS.includes(word)) return { ok: true, value: true }
  if (FALSE_WORDS.includes(word)) return { ok: true, value: false }
  return fail(`${quoted(raw)} is not a yes/no value. Use yes or no (true/false and 1/0 also work), or leave it empty for no.`)
}

function inRange(n: number, range: Range, what: string): Parsed<number> {
  if (n >= range.min && n <= range.max) return { ok: true, value: n }
  return fail(`${what} must be between ${formatNumber(range.min)} and ${formatNumber(range.max)}.`)
}

/** A whole number; thousands commas ("12,400") and a zero decimal part ("6,200.00") are allowed. */
export function parseInteger(raw: string, range: Range, what: string): Parsed<number> {
  if (raw === '') return fail(`${what} is empty. Enter a whole number.`)
  if (!INTEGER.test(raw)) return fail(`${quoted(raw)} is not a whole number. Enter digits only.`)
  return inRange(Number(raw.replace(/,/g, '')), range, what)
}

/** A dollar amount per SF; "$48.00", "48" and "1,200.50" are allowed. */
export function parseMoney(raw: string, range: Range, what: string): Parsed<number> {
  if (raw === '') return fail(`${what} is empty. Enter an amount in dollars per SF, e.g. 48.00.`)
  if (!MONEY.test(raw)) return fail(`${quoted(raw)} is not an amount. Enter dollars per SF as a number, e.g. 48.00.`)
  return inRange(Number(raw.replace(/[$,]/g, '')), range, what)
}

/** A real calendar date written YYYY-MM-DD. */
export function parseDate(raw: string, what: string): Parsed<ISODate> {
  if (raw === '') return fail(`${what} is empty. Enter a date as YYYY-MM-DD, e.g. 2027-01-31.`)
  const r = isoDate.safeParse(raw)
  if (r.success) return { ok: true, value: r.data }
  return fail(`${quoted(raw)} is not a real date written as YYYY-MM-DD. Enter it like 2027-01-31.`)
}
