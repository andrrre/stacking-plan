import { z } from 'zod'

/** A real calendar date as 'YYYY-MM-DD'. */
export const isoDate = z.iso.date()
