import { useEffect } from 'react'
import type { KpiKey } from '../../app/state/types'
import { selectBuilding } from '../../app/state/selectBuilding'
import { useAppState } from '../../app/state/useAppState'
import { formatNumber, formatSf, suitesLabel } from '../../domain/format'
import { kpis } from '../../domain/kpis'
import type { Kpis } from '../../domain/types'
import { KpiTile } from './KpiTile'
import styles from './kpi.module.css'

const OWNS_ESCAPE = 'dialog[open], [role=dialog], input, textarea, select'

/** "3,000 SF committed"; "12,400 SF potential" leads when some of the space is potential. */
function availableSub(k: Kpis): string {
  const parts = [
    k.potentialSf > 0 ? `${formatSf(k.potentialSf)} potential` : null,
    k.committedSf > 0 || k.potentialSf === 0 ? `${formatSf(k.committedSf)} committed` : null,
  ].filter((p): p is string => p !== null)
  return parts.join(' · ')
}

const leases = (n: number) => `${formatNumber(n)} ${n === 1 ? 'lease' : 'leases'}`

export function KpiBar() {
  const { state, dispatch } = useAppState()
  const k = kpis(selectBuilding(state), state.asOf, state.today, state.req.includePotential)
  const { highlight } = state

  useEffect(() => {
    if (highlight === null) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (e.target instanceof Element && e.target.closest(OWNS_ESCAPE)) return
      dispatch({ type: 'highlight/toggle', kpi: highlight })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [highlight, dispatch])

  const toggle = (kpi: KpiKey) => dispatch({ type: 'highlight/toggle', kpi })
  const common = { onToggle: toggle }
  const block = k.largestBlock

  return (
    <section className={styles.bar} aria-label="Key figures" data-print="hide">
      <KpiTile {...common} kpi="occupancy" testId="kpi-occupancy" label="Occupancy" pressed={highlight === 'occupancy'}
        value={k.occupancyPct === null ? '—' : `${formatNumber(Math.round(k.occupancyPct))}%`} bar={k.occupancyPct ?? 0} />
      <KpiTile {...common} kpi="vacant" testId="kpi-vacant" label="Available" pressed={highlight === 'vacant'}
        value={formatNumber(k.vacantSf)} unit="SF" sub={availableSub(k)} subTestId="kpi-vacant-potential" />
      <KpiTile {...common} kpi="expiring" testId="kpi-expiring" label="Expiring ≤ 12 months" pressed={highlight === 'expiring'}
        value={formatNumber(k.expiringSf)} unit="SF" sub={leases(k.expiringCount)} subTestId="kpi-expiring-leases" />
      <KpiTile {...common} kpi="largestBlock" testId="kpi-largest-block" label="Largest contiguous block" pressed={highlight === 'largestBlock'}
        value={block ? formatNumber(block.totalSf) : '—'} unit={block ? `SF · Floor ${block.floor}` : undefined}
        sub={suitesLabel(k.largestBlockSuiteNumbers) || undefined} subTestId="kpi-largest-block-suites" />
    </section>
  )
}
