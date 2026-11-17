import { addDays, addMonths, differenceInCalendarMonths, differenceInMonths, format, parseISO, startOfMonth } from 'date-fns'
import { HORIZON_MONTHS } from './constants.js'
import type { ISODate } from './types.js'

// ISO 'YYYY-MM-DD' in, ISO out. parseISO/format work in local time, so no UTC day shift.

const ISO_FORMAT = 'yyyy-MM-dd'

function toIso(d: Date): ISODate {
  return format(d, ISO_FORMAT)
}

/** date-fns addMonths: clamps to the end of a shorter month. */
export function addMonthsIso(d: ISODate, n: number): ISODate {
  return toIso(addMonths(parseISO(d), n))
}

export function addDaysIso(d: ISODate, n: number): ISODate {
  return toIso(addDays(parseISO(d), n))
}

/** Step 0 is today; step m ≥ 1 is the 1st of month(today) + m. */
export function sliderDate(today: ISODate, m: number): ISODate {
  if (m === 0) return today
  return toIso(addMonths(startOfMonth(parseISO(today)), m))
}

/** The latest slider step ≤ d, clamped to [today, step HORIZON_MONTHS]. */
export function snapToSlider(d: ISODate, today: ISODate): ISODate {
  if (d <= today) return today
  const m = differenceInCalendarMonths(parseISO(d), parseISO(today))
  return sliderDate(today, Math.min(m, HORIZON_MONTHS))
}

/** Slider index (0..HORIZON_MONTHS) of snapToSlider(d, today). */
export function monthOffset(d: ISODate, today: ISODate): number {
  const snapped = snapToSlider(d, today)
  return differenceInCalendarMonths(parseISO(snapped), parseISO(today))
}

/** Whole months from `from` to `to` (date-fns differenceInMonths); display only, e.g. "months remaining". */
export function monthsBetweenIso(from: ISODate, to: ISODate): number {
  return differenceInMonths(parseISO(to), parseISO(from))
}

export function maxIso(first: ISODate, ...rest: ISODate[]): ISODate {
  return rest.reduce((a, b) => (b > a ? b : a), first)
}
