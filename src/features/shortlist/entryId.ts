import type { Candidate, ISODate, ShortlistEntry } from '../../domain/types'

/** `${buildingId}|${asOf}|${candidate.key}|w|b` (spec-technical §3.1): the same space saved under a what-if is a separate entry. */
export function entryId(buildingId: string, asOf: ISODate, candidateKey: string, whatIf: boolean): string {
  return `${buildingId}|${asOf}|${candidateKey}|${whatIf ? 'w' : 'b'}`
}

/** A frozen snapshot of `candidate` as it stood at `asOf`. `whatIf` is true when a scenario was active. */
export function createEntry(buildingId: string, candidate: Candidate, asOf: ISODate, whatIf: boolean): ShortlistEntry {
  return { id: entryId(buildingId, asOf, candidate.key, whatIf), buildingId, candidate, asOf, whatIf }
}
