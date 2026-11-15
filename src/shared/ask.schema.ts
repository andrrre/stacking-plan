import { z } from 'zod'
import { isoDate } from './isoDate.js'
import { MAX_RENT_PSF, MAX_REQ_SF, MIN_RENT_PSF, MIN_REQ_SF } from './limits.js'

export const AskRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  today: isoDate,
})

export const ParsedQuerySchema = z.object({
  minSf: z.number().int().min(MIN_REQ_SF).max(MAX_REQ_SF).optional(),
  maxSf: z.number().int().min(MIN_REQ_SF).max(MAX_REQ_SF).optional(),
  maxRentPsf: z.number().min(MIN_RENT_PSF).max(MAX_RENT_PSF).optional(),
  moveInBy: isoDate.optional(),
}).refine((q) => q.minSf === undefined || q.maxSf === undefined || q.maxSf >= q.minSf)
