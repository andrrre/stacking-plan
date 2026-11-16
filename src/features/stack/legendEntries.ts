import { legendKeys, type FillKey } from '../../app/state/legendKeys'
import type { ColourMode } from '../../app/state/types'
import { formatNumber, formatSf } from '../../domain/format'
import type { StackModel } from './suiteVisual'

// The legend's pills: one per fill the colour mode paints, with how many suites (and how much space) carry it
// in the building as of the date shown. Pure: counted from the stack model, so a pill always matches the suites.

export type LegendEntry = { key: FillKey; label: string; count: number; sf: number }

const LABELS: Record<FillKey, string> = {
  vacant: 'Vacant',
  potential: 'Potential',
  expiring: 'Expiring ≤ 12 mo',
  committed: 'Committed',
  occupied: 'Occupied',
  common: 'Common area',
  'risk-le6': '≤ 6 months',
  'risk-le12': '≤ 12 months',
  'risk-le24': '≤ 24 months',
  'risk-le36': '≤ 36 months',
  'risk-gt36': 'Over 36 months',
  'risk-open': 'No end date',
}

/** The name a legend pill (and a suite's status chip) gives a fill. */
export const legendLabel = (key: FillKey): string => LABELS[key]

export function legendEntries(model: StackModel, mode: ColourMode): LegendEntry[] {
  const suites = model.floors.flatMap((f) => f.suites)
  return legendKeys(mode).map((key) => {
    const mine = suites.filter((v) => v.fill === key)
    return { key, label: LABELS[key], count: mine.length, sf: mine.reduce((sum, v) => sum + v.suite.areaSf, 0) }
  })
}

/** "6 suites · 35,150 SF", "1 suite · 3,000 SF", "0 suites". */
export function legendMeta(count: number, sf: number): string {
  const suites = `${formatNumber(count)} ${count === 1 ? 'suite' : 'suites'}`
  return sf > 0 ? `${suites} · ${formatSf(sf)}` : suites
}
