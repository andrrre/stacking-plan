import { z } from 'zod'

/** The accepted range: wide enough for any real lease, narrow enough that date arithmetic never leaves 4-digit years. */
export const MIN_ISO_DATE = '1900-01-01'
export const MAX_ISO_DATE = '2200-12-31'

/** A real calendar date as 'YYYY-MM-DD', between MIN_ISO_DATE and MAX_ISO_DATE inclusive. */
export const isoDate = z.iso.date().refine(
  (d) => d >= MIN_ISO_DATE && d <= MAX_ISO_DATE,
  `date must be between ${MIN_ISO_DATE} and ${MAX_ISO_DATE}`,
)
