import { suiteCandidate } from '../../domain/findFits'
import type { Building, Candidate, ISODate, ShortlistEntry } from '../../domain/types'

// Which spaces a suite tour visits, in order. Pure. A stop is a Candidate: one suite, or a saved multi-suite
// option on one floor, with everything the caption needs (size, asking rent, availability, client caveats).

export type StopInput = {
  building: Building // the building on screen (the scenario applied)
  buildingId: string
  asOf: ISODate
  today: ISODate
  shortlist: readonly ShortlistEntry[]
  matches: readonly Candidate[] // the active search's ranked matches ([] without a search)
  includePotential: boolean
}

/** Every available suite on its own, top floor first, left to right on each floor. */
function availableStops(b: Building, asOf: ISODate, today: ISODate, includePotential: boolean): Candidate[] {
  return [...b.floors]
    .sort((x, y) => y.number - x.number)
    .flatMap((f) => f.suites.flatMap((s) => suiteCandidate(f, s, asOf, today, includePotential) ?? []))
}

/** The shortlist's options saved for this building and date, once each, whose suites the building still has. */
function savedStops(i: StopInput): Candidate[] {
  const ids = new Set(i.building.floors.flatMap((f) => f.suites.map((s) => s.id)))
  const saved = i.shortlist
    .filter((e) => e.buildingId === i.buildingId && e.asOf === i.asOf && e.candidate.suiteIds.every((id) => ids.has(id)))
    .map((e) => e.candidate)
  return saved.filter((c, n) => saved.findIndex((d) => d.key === c.key) === n)
}

/**
 * The shortlist's options for this building and date if there are any; else the search's matches; else every
 * available suite (vacant, and potential with Include potential space on), top floor to bottom, left to right.
 */
export function tourStops(i: StopInput): Candidate[] {
  const saved = savedStops(i)
  if (saved.length > 0) return saved
  if (i.matches.length > 0) return [...i.matches]
  return availableStops(i.building, i.asOf, i.today, i.includePotential)
}

/**
 * A tour started from one suite: at the stop that holds it; a suite no stop holds gets a stop of its own (`own`)
 * in front; without one either, the tour starts at its first stop.
 */
export function tourFrom(stops: readonly Candidate[], suiteId: string, own: Candidate | null): { stops: Candidate[]; index: number } {
  const at = stops.findIndex((c) => c.suiteIds.includes(suiteId))
  if (at >= 0) return { stops: [...stops], index: at }
  return { stops: own ? [own, ...stops] : [...stops], index: 0 }
}
