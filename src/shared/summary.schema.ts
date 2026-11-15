import { z } from 'zod'
import { isoDate } from './isoDate.js'

/** One shortlisted option in client wording. No tenant names, no lease rents; notes are client-audience caveat text. */
export const ClientOptionSchema = z.object({
  label: z.string().max(40),
  floor: z.number().int(),
  suiteNumbers: z.array(z.string()).min(1),
  totalSf: z.number(),
  blendedRentPsf: z.number().optional(),
  availableFrom: isoDate,
  notes: z.array(z.string().max(200)),
})

export const SummaryRequestSchema = z.object({
  buildingName: z.string().min(1).max(120),
  asOf: isoDate,
  options: z.array(ClientOptionSchema).min(1).max(5),
})

export const SummaryCopySchema = z.object({
  headline: z.string().min(1).max(90),
  paragraph: z.string().min(1).max(600),
})

export type SummaryRequest = z.infer<typeof SummaryRequestSchema>
export type SummaryCopy = z.infer<typeof SummaryCopySchema>
