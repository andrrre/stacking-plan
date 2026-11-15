import { maximalRuns, largestBlock } from './blocks'
import { HORIZON_MONTHS } from './constants'
import { monthOffset, sliderDate } from './dates'
import { findFits } from './findFits'
import type { Building, ISODate, NoFit, NoFitReason, Requirement } from './types'

// spec-technical §5.4, spec.md A6. Why nothing fits on D, and the first slider step where something does.

type Limit = 'maxSf' | 'maxRentPsf'

const without = (req: Requirement, limits: readonly Limit[]): Requirement =>
  limits.reduce<Requirement>((r, k) => ({ ...r, [k]: undefined }), req)

/** The limits whose removal gives a fit ("and/or": both together when neither alone is enough). */
function filteredBy(b: Building, req: Requirement, D: ISODate, today: ISODate): Limit[] {
  const set: Limit[] = (['maxSf', 'maxRentPsf'] as const).filter((k) => req[k] !== undefined)
  const fitsWithout = (limits: readonly Limit[]) => findFits(b, without(req, limits), D, today).length > 0
  const single = set.filter((k) => fitsWithout([k]))
  if (single.length > 0) return single
  return set.length === 2 && fitsWithout(set) ? set : []
}

function reasonsFor(b: Building, req: Requirement, D: ISODate, today: ISODate): NoFitReason[] {
  const block = largestBlock(b, D, today, req.includePotential)
  if (!block) return [{ kind: 'nothingAvailable' }]
  const runs = b.floors.flatMap((f) => maximalRuns(f, D, today, req.includePotential))
  const totalSf = runs.reduce((sum, r) => sum + r.totalSf, 0)
  const floorCount = new Set(runs.map((r) => r.floor)).size
  const by = filteredBy(b, req, D, today)
  return [
    { kind: 'largestBlock', block },
    ...(totalSf >= req.minSf ? [{ kind: 'spread' as const, totalSf, floorCount, blockCount: runs.length }] : []),
    ...(by.length > 0 ? [{ kind: 'filtered' as const, by }] : []),
  ]
}

/**
 * Reasons nothing fits on D, then the earliest slider step with a fit (always counting potential space).
 * Precondition: call only when `findFits(b, req, D, today)` is empty; otherwise the reasons and the
 * earliest-fit date are meaningless.
 */
export function explainNoFit(b: Building, req: Requirement, D: ISODate, today: ISODate): NoFit {
  const reasons = reasonsFor(b, req, D, today)
  const scanReq: Requirement = { ...req, includePotential: true }
  // With the toggle off a potential fit may already exist on D, so D itself is checked.
  const start = monthOffset(D, today) + (req.includePotential ? 1 : 0)
  for (let m = start; m <= HORIZON_MONTHS; m++) {
    const date = sliderDate(today, m)
    const [candidate] = findFits(b, scanReq, date, today)
    if (candidate) return { reasons, earliestFit: { date, candidate } }
  }
  return { reasons, earliestFit: null }
}
