import { isAvailable, statusAt } from './status'
import type { Block, Building, Floor, ISODate, Suite } from './types'

type RunAcc = { runs: Suite[][]; cur: Suite[] }

/** Maximal runs of consecutive available suites, split at unavailable suites and joinsNext=false boundaries. */
export function maximalRuns(f: Floor, D: ISODate, today: ISODate, includePotential: boolean): Block[] {
  const { runs, cur } = f.suites.reduce<RunAcc>((acc, s, i) => {
    if (!isAvailable(s, statusAt(s, D, today), includePotential)) {
      return acc.cur.length ? { runs: [...acc.runs, acc.cur], cur: [] } : acc
    }
    if (acc.cur.length && !f.suites[i - 1]?.joinsNext) return { runs: [...acc.runs, acc.cur], cur: [s] }
    return { runs: acc.runs, cur: [...acc.cur, s] }
  }, { runs: [], cur: [] })
  const all = cur.length ? [...runs, cur] : runs
  return all.map((r) => ({ floor: f.number, suiteIds: r.map((s) => s.id), totalSf: r.reduce((sum, s) => sum + s.areaSf, 0) }))
}

/** Largest run by total SF; ties go to the higher floor, then the leftmost run. */
export function largestBlock(b: Building, D: ISODate, today: ISODate, includePotential: boolean): Block | null {
  const runs = b.floors.flatMap((f) => maximalRuns(f, D, today, includePotential))
  return runs.reduce<Block | null>((best, r) => {
    if (!best) return r
    if (r.totalSf !== best.totalSf) return r.totalSf > best.totalSf ? r : best
    return r.floor > best.floor ? r : best
  }, null)
}
