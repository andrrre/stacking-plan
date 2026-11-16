import { maximalRuns } from '../../domain/blocks'
import { formatMmYyyy, formatNumber, formatPsf, formatSf } from '../../domain/format'
import type { Building, Candidate, ISODate, Requirement } from '../../domain/types'
import { clientOptions, type ClientOption } from '../shortlist/clientOptions'
import { createEntry } from '../shortlist/entryId'

// The tour's caption card: what a prospective tenant may read about the space they are standing in. Built
// through the client summary's own projection (clientOptions: suite numbers, sizes, asking rent, dates and
// client-worded notes), so no tenant name and no lease rent can reach it; the building is read only for the
// suites' asking rents and which neighbours combine with them.

export type CaptionInput = {
  stop: Candidate
  building: Building
  asOf: ISODate
  today: ISODate
  includePotential: boolean
  req: Requirement | null // the active search, if any
  whatIf: boolean // a scenario is applied
  index: number
  count: number
}

export type TourCaption = { title: string; counter: string; lines: string[] }

function sizeLine(o: ClientOption): string {
  return o.suiteNumbers.length > 1 ? `${formatSf(o.totalSf)} · ${o.suiteNumbers.length} suites combined` : formatSf(o.totalSf)
}

const availableLine = (o: ClientOption, today: ISODate) =>
  (o.availableFrom <= today ? 'Available now' : `Available from ${formatMmYyyy(o.availableFrom)}`)

/** Asking rent only when every suite of the stop has one on file (a blend over a missing rent would understate it). */
function askingLine(i: CaptionInput, o: ClientOption): string | null {
  const suites = i.building.floors.flatMap((f) => f.suites).filter((s) => i.stop.suiteIds.includes(s.id))
  if (suites.length === 0 || suites.some((s) => s.askingRentPsf === undefined)) return null
  return `${o.suiteNumbers.length > 1 ? 'Blended asking' : 'Asking'} ${formatPsf(o.blendedRentPsf)} /SF/yr`
}

/** "Combines with 710 → 10,500 SF": the rest of the contiguous available run (the KPI's block logic) the stop sits in. */
function combineLine(i: CaptionInput): string | null {
  const f = i.building.floors.find((x) => x.number === i.stop.floor)
  if (!f) return null
  const run = maximalRuns(f, i.asOf, i.today, i.includePotential).find((r) => r.suiteIds.includes(i.stop.suiteIds[0] ?? ''))
  const others = f.suites.filter((s) => run?.suiteIds.includes(s.id) && !i.stop.suiteIds.includes(s.id))
  return run && others.length > 0 ? `Combines with ${others.map((s) => s.number).join(' + ')} → ${formatSf(run.totalSf)}` : null
}

/** Why it works against the search: the size needed and what is to spare (none when the stop is short of it). */
function fitLine(i: CaptionInput): string | null {
  if (!i.req) return null
  const spare = i.stop.totalSf - i.req.minSf
  return spare < 0 ? null : `Fits ${formatSf(i.req.minSf)} needed · +${formatNumber(spare)} SF to spare`
}

export function tourCaption(i: CaptionInput): TourCaption {
  const [o] = clientOptions([createEntry(i.building.id, i.stop, i.asOf, i.whatIf)])
  if (!o) return { title: '', counter: '', lines: [] }
  const lines = [sizeLine(o), availableLine(o, i.today), askingLine(i, o), combineLine(i), fitLine(i), ...o.notes]
  return {
    title: `${o.label} · Floor ${o.floor}`,
    counter: `${i.index + 1} of ${i.count}`,
    lines: lines.filter((l): l is string => l !== null),
  }
}
