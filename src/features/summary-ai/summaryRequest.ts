import type { ISODate } from '../../domain/types'
import type { SummaryRequest } from '../../shared/summary.schema'
import type { ClientOption } from '../shortlist/clientOptions'

const MAX_OPTIONS = 5
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/**
 * The /api/summary request, from the single client-safe projection (`clientOptions`): its first five options,
 * and only the fields the schema names. Rank and the what-if flag stay behind; the what-if line is already a note.
 */
export function toSummaryRequest(buildingName: string, asOf: ISODate, options: readonly ClientOption[]): SummaryRequest {
  return {
    buildingName: clip(buildingName, 120),
    asOf,
    options: options.slice(0, MAX_OPTIONS).map((o) => ({
      label: clip(o.label, 40),
      floor: o.floor,
      suiteNumbers: [...o.suiteNumbers],
      totalSf: o.totalSf,
      blendedRentPsf: o.blendedRentPsf,
      availableFrom: o.availableFrom,
      notes: o.notes.map((n) => clip(n, 200)),
    })),
  }
}
