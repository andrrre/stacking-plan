import { isoDate } from '../shared/isoDate'
import { MAX_RENT_PSF, MAX_REQ_SF, MIN_RENT_PSF, MIN_REQ_SF } from './constants'
import { addDaysIso, addMonthsIso } from './dates'
import type { ISODate, ParsedQuery } from './types'

// Rule-based fallback for the Ask box (spec A9). Order matters: dates are read and removed first,
// then rents, so a year or a "$" amount is never read as a size.

const MAX_CHARS = 500

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`
const BY = String.raw`\bby\s+(?:the\s+)?(?:end\s+of\s+)?`
const YEAR_TAIL = String.raw`(?:\s*,?\s*(?:of\s+)?(20\d{2})|\s+(?:of\s+)?(next\s+year|this\s+year))?\b`

const NOW_RE = /\b(?:now|today|asap|immediately)\b/
const BY_ISO_RE = new RegExp(`${BY}(20\\d{2}-\\d{2}-\\d{2})(?![-\\d])`)
const BY_QUARTER_RE = new RegExp(`${BY}q([1-4])${YEAR_TAIL}`)
const BY_MONTH_RE = new RegExp(`${BY}${MONTH}${YEAR_TAIL}`)
const BY_YEAR_RE = new RegExp(`${BY}(20\\d{2})(?![-\\d])`)
// Other date words that carry a year ("Q2 2027", "in 2027", "2027-13-45") are removed so the year is not read as a size.
const OTHER_DATE_RE = new RegExp(
  `(?:\\bq[1-4]|\\b${MONTH})\\s*,?\\s*20\\d{2}\\b|\\b(?:in|from|until|before|after|of|by)\\s+20\\d{2}(?:-\\d{1,2}-\\d{1,2})?\\b`,
  'g',
)

// Comma thousands or a plain decimal; never followed by another digit ("1,0000" is not 1,000).
const NUM = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?!\d)`
const NO_WORD_BEFORE = String.raw`(?<![\w.,$/])`
const K = String.raw`k(?![a-z])`
const RENT_UNIT = String.raw`(?:psf|\/\s*(?:sf|sq\.?\s*ft|ft)|per\s+(?:sq\.?\s*ft|sf|square\s+f(?:oo|ee)t|foot|ft))(?![a-z])`
const RENT_FLOOR = String.raw`at\s+least|over|above|min(?:imum)?|more\s+than|from`
const RENT_RE = new RegExp(
  `(?:(?<floor>${RENT_FLOOR})\\s*)?(?:\\$\\s*(?<a>${NUM})(?<ak>${K})?(?:\\s*(?:-|–|—|to|and)\\s*\\$?\\s*(?<b>${NUM})(?<bk>${K})?)?(?:\\s*${RENT_UNIT})?|${NO_WORD_BEFORE}(?<c>${NUM})\\s*${RENT_UNIT})`,
  'g',
)

const AREA_UNIT = String.raw`sf|rsf|usf|sq\.?\s*ft\.?|sqft|square\s+f(?:oo|ee)t`
const term = (p: string) => `(?<${p}>${NUM})(?<${p}k>${K})?(?:\\s*(?<${p}u>${AREA_UNIT})(?![a-z]))?`
const MIN_WORDS = String.raw`at\s+least|min(?:imum)?|~|about|roughly|around|approx(?:imately|\.)?`
const MAX_WORDS = String.raw`up\s+to|max(?:imum)?|under|below|less\s+than|no\s+more\s+than`
const NOT_SIZE_BEFORE = String.raw`(?<!\b(?:suite|ste|floor|fl|unit)\.?\s*)`
const NOT_SIZE_AFTER = String.raw`(?!\s*(?:people|employees|staff|seats|heads|desks)\b)`
const AREA_RE = new RegExp(
  `(?:(?<mod>${MIN_WORDS}|${MAX_WORDS})\\s*)?(?:between\\s+)?${NO_WORD_BEFORE}${NOT_SIZE_BEFORE}${term('a')}(?:\\s*(?:-|–|—|to|and)\\s*${term('b')})?${NOT_SIZE_AFTER}`,
  'g',
)
const MAX_WORD_RE = new RegExp(`^(?:${MAX_WORDS})$`)

type Term = { raw: string; n: number; k: boolean; unit: boolean }
type Hit = { strong: boolean; minSf?: number; maxSf?: number }
type Sizes = { minSf?: number; maxSf?: number }

const toNumber = (s: string | undefined) => Number((s ?? '').replace(/,/g, ''))

/** Last day of month `m` (1..12) of `year`, through dates.ts. */
function monthEnd(year: number, m: number): ISODate {
  const first = `${year}-${String(m).padStart(2, '0')}-01`
  return addDaysIso(addMonthsIso(first, 1), -1)
}

/** The named period's end; with no year, the first such end that has not passed. */
function periodEnd(m: number, yearText: string | undefined, relative: string | undefined, today: ISODate): ISODate {
  const thisYear = Number(today.slice(0, 4))
  if (yearText) return monthEnd(Number(yearText), m)
  if (relative?.startsWith('next')) return monthEnd(thisYear + 1, m)
  const end = monthEnd(thisYear, m)
  return end < today && !relative ? monthEnd(thisYear + 1, m) : end
}

function findMoveIn(text: string, today: ISODate): ISODate | undefined {
  const iso = BY_ISO_RE.exec(text)
  if (iso) return isoDate.safeParse(iso[1]).success ? iso[1] : undefined
  const q = BY_QUARTER_RE.exec(text)
  if (q) return periodEnd(Number(q[1]) * 3, q[2], q[3], today)
  const m = BY_MONTH_RE.exec(text)
  if (m) return periodEnd(MONTHS.indexOf((m[1] ?? '').slice(0, 3)) + 1, m[2], m[3], today)
  const y = BY_YEAR_RE.exec(text)
  if (y) return `${y[1]}-12-31`
  return NOW_RE.test(text) ? today : undefined
}

function stripDates(text: string): string {
  return [BY_ISO_RE, BY_QUARTER_RE, BY_MONTH_RE, BY_YEAR_RE, OTHER_DATE_RE].reduce(
    (t, re) => t.replace(new RegExp(re.source, 'g'), ' '),
    text,
  )
}

/** The first maximum rent: "$N" or "N psf", and the top of a "$N-$M" range. A minimum ("at least $50") is skipped. */
function findRent(text: string): number | undefined {
  for (const { groups: g = {} } of text.matchAll(RENT_RE)) {
    if (g.floor) continue
    const amounts = [g.a && toNumber(g.a) * (g.ak ? 1000 : 1), g.b && toNumber(g.b) * (g.bk ? 1000 : 1), g.c && toNumber(g.c)]
      .filter((x): x is number => typeof x === 'number')
    const rent = Math.max(...amounts)
    if (rent >= MIN_RENT_PSF && rent <= MAX_RENT_PSF) return rent
  }
  return undefined
}

/** A size in SF when the term reads as an area (A9: k, an SF unit, or ≥ 1000), else null. */
function areaOf(t: Term): number | null {
  if (!t.k && /^\d{1,3}(?:\.\d{3})+$/.test(t.raw)) return null // "9.000": European thousands, unreadable
  const bare = !t.k && !t.unit
  if (bare && (t.n < 1000 || /^(?:19|20)\d{2}$/.test(t.raw))) return null // under 1000, or a year
  const sf = Math.round(t.n * (t.k ? 1000 : 1))
  return sf >= MIN_REQ_SF && sf <= MAX_REQ_SF ? sf : null
}

function termOf(g: Record<string, string | undefined>, p: 'a' | 'b'): Term | null {
  const raw = g[p]
  return raw === undefined ? null : { raw, n: toNumber(raw), k: Boolean(g[`${p}k`]), unit: Boolean(g[`${p}u`]) }
}

/** "9-11k" and "between 9 and 11k": a trailing k applies to a bare first number under 1000. */
function rangeOf(first: Term, second: Term | null): [number, number] | null {
  const hi = second && areaOf(second)
  if (!hi || !second) return null
  const lo = areaOf(second.k && !first.k && !first.unit && first.n < 1000 ? { ...first, k: true } : first)
  return lo === null ? null : [Math.min(lo, hi), Math.max(lo, hi)]
}

function hitOf(g: Record<string, string | undefined>): Hit | null {
  const first = termOf(g, 'a')
  if (!first) return null
  const second = termOf(g, 'b')
  const range = rangeOf(first, second)
  if (range) return { strong: [first, second].some((t) => t && (t.k || t.unit)), minSf: range[0], maxSf: range[1] }
  const sf = areaOf(first)
  if (sf === null) return null
  const strong = first.k || first.unit
  return MAX_WORD_RE.test((g.mod ?? '').replace(/\s+/g, ' ')) ? { strong, maxSf: sf } : { strong, minSf: sf }
}

/** First min and first max win; terms with k or an SF unit outrank bare numbers. */
function findSizes(text: string): Sizes {
  const hits = [...text.matchAll(AREA_RE)].map((m) => hitOf(m.groups ?? {})).filter((h): h is Hit => h !== null)
  const ranked = hits.some((h) => h.strong) ? hits.filter((h) => h.strong) : hits
  const sizes = ranked.reduce<Sizes>((acc, h) => {
    if (h.minSf !== undefined && h.maxSf !== undefined) return acc.minSf === undefined && acc.maxSf === undefined ? { minSf: h.minSf, maxSf: h.maxSf } : acc
    if (h.maxSf !== undefined) return acc.maxSf === undefined ? { ...acc, maxSf: h.maxSf } : acc
    return acc.minSf === undefined ? { ...acc, minSf: h.minSf } : acc
  }, {})
  if (sizes.minSf !== undefined && sizes.maxSf !== undefined && sizes.maxSf < sizes.minSf) return { minSf: sizes.minSf }
  return sizes
}

/** Structured fields from a broker's plain-words requirement. Pure: `today` is passed in. */
export function parseQuery(text: string, today: ISODate): ParsedQuery {
  const lower = text.slice(0, MAX_CHARS).toLowerCase()
  const date = findMoveIn(lower, today)
  const noDates = stripDates(lower)
  const maxRentPsf = findRent(noDates)
  const { minSf, maxSf } = findSizes(noDates.replace(RENT_RE, ' '))
  return {
    ...(minSf !== undefined && { minSf }),
    ...(maxSf !== undefined && { maxSf }),
    ...(maxRentPsf !== undefined && { maxRentPsf }),
    ...(date !== undefined && { moveInBy: date < today ? today : date }),
  }
}
