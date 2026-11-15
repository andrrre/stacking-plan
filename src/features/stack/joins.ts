import type { SuiteVisual } from './suiteVisual'

const isOpenVacant = (v: SuiteVisual | undefined) => v?.status.status === 'vacant' && v.status.overlay !== 'committed'

/** A dashed joint is drawn between neighbouring vacant suites that can combine (spec A4). Shared by the 2D and 3D stacks. */
export function joinsNext(suites: readonly SuiteVisual[], i: number): boolean {
  const v = suites[i]
  return Boolean(v?.suite.joinsNext) && isOpenVacant(v) && isOpenVacant(suites[i + 1])
}
