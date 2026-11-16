import { useCallback, useMemo, useState } from 'react'
import type { Layout3D } from '../layout3d'
import type { SuiteVisual } from '../../stack/suiteVisual'

// Whether the previewed move's block is in the air. A new out/in pair (from none or from another pair) takes
// off; the same pair re-rendering (hover, focus, orbiting) does not. The flight ends when the block lands, and
// at once when the preview ends, when one of its suites leaves the layout (floor view) or under reduced motion.
// While it flies the destination suite is hidden (box, edges and label), so it appears when the block lands.

export type MovePair = { key: string; outId: string; inId: string }

export type MoveFlightState = { pair: MovePair | null; flying: boolean; land: () => void }

function pairOf(visuals: ReadonlyMap<string, SuiteVisual>): MovePair | null {
  const all = [...visuals.values()]
  const outId = all.find((v) => v.move === 'out')?.suite.id
  const inId = all.find((v) => v.move === 'in')?.suite.id
  return outId && inId ? { key: `${outId}>${inId}`, outId, inId } : null
}

export function useMoveFlight(visuals: ReadonlyMap<string, SuiteVisual>, layout: Layout3D, reduced: boolean): MoveFlightState {
  const pair = useMemo(() => pairOf(visuals), [visuals])
  const key = pair?.key ?? null
  const ends = pair !== null && [pair.outId, pair.inId].every((id) => layout.suites.some((b) => b.id === id))
  const [seen, setSeen] = useState<string | null>(null)
  const [landed, setLanded] = useState(true)
  let done = landed
  // Adjusting state while rendering (not in an effect), so the destination is hidden from the very first frame.
  if (key !== seen) {
    setSeen(key)
    done = key === null
    setLanded(done)
  }
  if (!done && (!ends || reduced)) {
    done = true
    setLanded(true)
  }
  const land = useCallback(() => setLanded(true), [])
  return { pair, flying: !done, land }
}
