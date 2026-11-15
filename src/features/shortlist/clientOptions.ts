import { suitesLabel } from '../../domain/format'
import type { ISODate, ShortlistEntry } from '../../domain/types'
import { optionNotes } from './optionNotes'

/** One option as a client may see it. The single client projection: the summary table renders it and the AI summary request sends it. */
export type ClientOption = {
  rank: number
  label: string
  floor: number
  suiteNumbers: string[]
  totalSf: number
  blendedRentPsf: number
  availableFrom: ISODate
  notes: string[]
  whatIf: boolean
}

/** Built only from suite numbers, asking rent, dates and client-worded notes: no tenant, no lease. */
export function clientOptions(entries: readonly ShortlistEntry[]): ClientOption[] {
  return entries.map((e, i) => ({
    rank: i + 1,
    label: suitesLabel(e.candidate.suiteNumbers),
    floor: e.candidate.floor,
    suiteNumbers: [...e.candidate.suiteNumbers],
    totalSf: e.candidate.totalSf,
    blendedRentPsf: e.candidate.blendedRentPsf,
    availableFrom: e.candidate.availableFrom,
    notes: optionNotes(e, 'client'),
    whatIf: e.whatIf,
  }))
}
