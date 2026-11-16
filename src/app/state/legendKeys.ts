import type { ColourMode } from './types'

// The legend's keys are the suites' fill keys: a legend pill filters on exactly what a suite is painted as,
// so the availability and lease-risk legends work the same way. Order is the legend's order.

export const AVAILABILITY_KEYS = ['vacant', 'potential', 'expiring', 'committed', 'occupied', 'common'] as const

export const RISK_KEYS = [
  'vacant', 'potential', 'committed', 'risk-le6', 'risk-le12', 'risk-le24', 'risk-le36', 'risk-gt36', 'risk-open', 'common',
] as const

/** What a suite is painted as (and what a legend pill stands for). */
export type FillKey = (typeof AVAILABILITY_KEYS)[number] | (typeof RISK_KEYS)[number]

/** Every fill key, in the order the 3D palette reads their tokens. */
export const FILL_KEYS: readonly FillKey[] = [
  'occupied', 'expiring', 'vacant', 'potential', 'committed', 'common',
  'risk-le6', 'risk-le12', 'risk-le24', 'risk-le36', 'risk-gt36', 'risk-open',
]

export function legendKeys(mode: ColourMode): readonly FillKey[] {
  return mode === 'risk' ? RISK_KEYS : AVAILABILITY_KEYS
}
