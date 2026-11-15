import { z } from 'zod'
import { isoDate } from './isoDate.js'

export const AskRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  today: isoDate,
})

export const ParsedQuerySchema = z.object({
  minSf: z.number().int().min(1).max(1_000_000).optional(),
  maxSf: z.number().int().min(1).max(1_000_000).optional(),
  maxRentPsf: z.number().min(1).max(1000).optional(),
  moveInBy: isoDate.optional(),
}).refine((q) => q.minSf === undefined || q.maxSf === undefined || q.maxSf >= q.minSf)
