import { formatMmYyyy, formatSf } from '../../domain/format'
import type { StatusResult, Suite } from '../../domain/types'
import type { ColourMode } from '../../app/state/types'

// What a suite's label says, in the 2D stack and on the 3D building alike: line 1 is "number · SF", line 2 the
// tenant or status in words (the label's non-colour status cue). Pure; the as-of date is in `st`.

/** Below this a suite's label is its number alone; the details panel has the rest. */
export const COMPACT_SF = 2500

export type SuiteLabel = {
  number: string
  sf: string // '4,300 SF'
  line2: string // tenant | 'Vacant' | 'Tenant · ends MM/YYYY' | 'Potential · was Tenant' | 'Committed · starts MM/YYYY' | area name
  compact: boolean // under COMPACT_SF: the number alone
}

/** A leased suite's line 2; lease risk mode always says when the lease ends, availability only when it is expiring. */
function leasedLine(st: Extract<StatusResult, { lease: unknown }>, mode: ColourMode): string {
  const { tenant, end } = st.lease
  if (end !== null && (st.status === 'expiring' || mode === 'risk')) return `${tenant} · ends ${formatMmYyyy(end)}`
  return mode === 'risk' ? `${tenant} · no end date` : tenant
}

function line2For(s: Suite, st: StatusResult, mode: ColourMode): string {
  switch (st.status) {
    case 'common': return s.name || 'Common area'
    case 'occupied':
    case 'expiring': return leasedLine(st, mode)
    case 'vacant':
      if (st.overlay === 'potential') return `Potential · was ${st.endedLease.tenant}`
      if (st.overlay === 'committed') return `Committed · starts ${formatMmYyyy(st.nextLease.start)}`
      return 'Vacant'
  }
}

export function suiteLabel(s: Suite, st: StatusResult, mode: ColourMode): SuiteLabel {
  return { number: s.number, sf: formatSf(s.areaSf), line2: line2For(s, st, mode), compact: s.areaSf < COMPACT_SF }
}
