import { describe, it, expect } from 'vitest'
import { outlineRuns, segments } from './segments'

describe('outlineRuns', () => {
  it('keeps disjoint runs, sorted by rank', () => {
    expect(outlineRuns([{ rank: 2, first: 2, last: 3 }, { rank: 1, first: 0, last: 1 }])).toEqual([
      { rank: 1, first: 0, last: 1 },
      { rank: 2, first: 2, last: 3 },
    ])
  })

  it('trims an overlapping lower-ranked run to its non-overlapped side', () => {
    expect(outlineRuns([{ rank: 3, first: 1, last: 1 }, { rank: 4, first: 0, last: 1 }])).toEqual([
      { rank: 3, first: 1, last: 1 },
      { rank: 4, first: 0, last: 0 },
    ])
  })

  it('keeps the larger side when a better run sits in the middle', () => {
    expect(outlineRuns([{ rank: 1, first: 1, last: 1 }, { rank: 2, first: 0, last: 3 }])).toEqual([
      { rank: 1, first: 1, last: 1 },
      { rank: 2, first: 2, last: 3 },
    ])
  })

  it('drops a run fully covered by better ones', () => {
    expect(outlineRuns([{ rank: 1, first: 0, last: 2 }, { rank: 2, first: 1, last: 2 }])).toEqual([{ rank: 1, first: 0, last: 2 }])
  })

  it('handles no runs', () => {
    expect(outlineRuns([])).toEqual([])
  })
})

describe('segments', () => {
  it('collapses each outlined run into one segment at its first suite', () => {
    expect(segments(4, [{ rank: 1, first: 1, last: 2 }])).toEqual([
      { kind: 'suite', index: 0 },
      { kind: 'run', run: { rank: 1, first: 1, last: 2 } },
      { kind: 'suite', index: 3 },
    ])
  })

  it('returns nothing for an empty floor', () => {
    expect(segments(0, [])).toEqual([])
  })
})
