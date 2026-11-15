import type { MatchRun } from './suiteVisual'

// How a floor's suites split into plain suites and match outlines. Pure, so the 2D stack, the 3D view (S13)
// and the summary's mini stack (S9) draw the same outlines.

export type Segment = { kind: 'suite'; index: number } | { kind: 'run'; run: MatchRun }

const overlaps = (a: MatchRun, b: MatchRun) => a.first <= b.last && b.first <= a.last

/** The part of `r` outside `k`: the larger remaining side (left on a tie), or null when nothing remains. */
function trimAround(r: MatchRun, k: MatchRun): MatchRun | null {
  const left = k.first > r.first ? { ...r, last: k.first - 1 } : null
  const right = k.last < r.last ? { ...r, first: k.last + 1 } : null
  if (left && right) return right.last - right.first > left.last - left.first ? right : left
  return left ?? right
}

/** Trims `r` until it overlaps none of `kept`; null when nothing of it is left. */
function trimRun(r: MatchRun, kept: readonly MatchRun[]): MatchRun | null {
  const hit = kept.find((k) => overlaps(r, k))
  if (!hit) return r
  const rest = trimAround(r, hit)
  return rest && trimRun(rest, kept)
}

/**
 * Disjoint outlines in rank order. A run that overlaps a better-ranked one keeps only its larger
 * non-overlapping side, so shared suites carry the better badge and every matched suite stays outlined.
 */
export function outlineRuns(runs: readonly MatchRun[]): MatchRun[] {
  return [...runs]
    .sort((a, b) => a.rank - b.rank)
    .reduce<MatchRun[]>((kept, r) => {
      const t = trimRun(r, kept)
      return t ? [...kept, t] : kept
    }, [])
}

/** Suites in stored order, with each outlined run collapsed into one segment at its first suite. */
export function segments(suiteCount: number, runs: readonly MatchRun[]): Segment[] {
  const kept = outlineRuns(runs)
  return Array.from({ length: suiteCount }, (_, i) => i).flatMap((i): Segment[] => {
    const run = kept.find((r) => r.first <= i && i <= r.last)
    if (!run) return [{ kind: 'suite', index: i }]
    return run.first === i ? [{ kind: 'run', run }] : []
  })
}
