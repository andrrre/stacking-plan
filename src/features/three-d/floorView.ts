import { formatNumber, formatSf } from '../../domain/format'
import type { FloorVisual, StackModel, SuiteVisual } from '../stack/suiteVisual'

// Floor view: which floor it opens on, what the vertical floor slider says and marks, and how the mouse
// wheel steps it. Pure: a StackModel in, plain values out.

/** Space a broker can offer at the as-of date: vacant or potential, not space already committed to a new lease. */
export const isVacant = (v: SuiteVisual): boolean => v.status.status === 'vacant' && v.status.overlay !== 'committed'

/** The selected suite's floor; else the highest floor with vacant space; else the top floor (null: no floors). */
export function initialFloor(model: StackModel, selectedId: string | null): number | null {
  const selected = model.floors.find((f) => f.suites.some((v) => v.suite.id === selectedId))
  const vacant = model.floors.find((f) => f.suites.some(isVacant)) // floors are highest first
  return (selected ?? vacant ?? model.floors[0])?.number ?? null
}

/** One slider tick: the floor, whether it has vacant space, whether a search match lies on it. */
export type FloorMark = { floor: number; vacant: boolean; match: boolean }

/** A tick per floor, highest first (the slider's top). */
export function floorMarks(model: StackModel): FloorMark[] {
  return model.floors.map((f) => ({
    floor: f.number,
    vacant: f.suites.some(isVacant),
    match: f.suites.some((v) => v.matchRank !== null),
  }))
}

/** "Floor 7, 7 of 12": the floor, then its place counted from the bottom among all the floors. */
export function floorValueText(marks: readonly FloorMark[], floor: number): string {
  const place = marks.length - marks.findIndex((m) => m.floor === floor)
  return `Floor ${floor}, ${place} of ${marks.length}`
}

/** "Floor 7 · 12,400 SF · 10,500 SF vacant" */
export function floorCaption(f: FloorVisual): string {
  const vacantSf = f.suites.filter(isVacant).reduce((sum, v) => sum + v.suite.areaSf, 0)
  return `Floor ${f.number} · ${formatNumber(f.plateSf)} SF · ${vacantSf > 0 ? `${formatSf(vacantSf)} vacant` : 'no vacancy'}`
}

/** A mouse wheel notch, in px of deltaY; trackpads send many smaller deltas that add up to it. */
export const WHEEL_NOTCH = 100
/** Pixels per line for a wheel that reports lines (deltaMode 1, e.g. Firefox with a mouse). */
export const WHEEL_LINE = 33

/** A wheel delta in pixels: as given (deltaMode 0), by the line (1) or by the page, here the rail's height (2). */
export function wheelPixels(delta: number, mode: number, pageHeight: number): number {
  if (mode === 1) return delta * WHEEL_LINE
  return mode === 2 ? delta * pageHeight : delta
}
const WHEEL_STEP_AT = 50

/**
 * Adds a wheel delta to the running total `acc` and says whether to step a floor: +1 (up the building, the
 * wheel turned away) or -1. One step at most per event; a change of direction starts the total again.
 */
export function wheelStep(acc: number, deltaY: number): { acc: number; step: -1 | 0 | 1 } {
  const total = Math.sign(acc) !== 0 && Math.sign(acc) !== Math.sign(deltaY) ? deltaY : acc + deltaY
  if (Math.abs(total) < WHEEL_STEP_AT) return { acc: total, step: 0 }
  return { acc: 0, step: total < 0 ? 1 : -1 }
}
