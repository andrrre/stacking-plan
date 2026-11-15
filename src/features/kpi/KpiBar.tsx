import { useEffect } from 'react'
import type { KpiKey } from '../../app/state/types'
import { selectBuilding } from '../../app/state/selectBuilding'
import { useAppState } from '../../app/state/useAppState'
import { formatNumber, formatSf } from '../../domain/format'
import { kpis } from '../../domain/kpis'
import type { Kpis } from '../../domain/types'
import { KpiTile } from './KpiTile'
import styles from './kpi.module.css'

const OWNS_ESCAPE = 'dialog[open], [role=dialog], input, textarea, select'

/** "of which potential 12,400 SF · committed 3,000 SF"; undefined when both are 0. */
function vacantSub(k: Kpis): string | undefined {
  const parts = [
    k.potentialSf > 0 ? `potential ${formatSf(k.potentialSf)}` : null,
    k.committedSf > 0 ? `committed ${formatSf(k.committedSf)}` : null,
  ].filter((p): p is string => p !== null)
  return parts.length > 0 ? `of which ${parts.join(' · ')}` : undefined
}

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
  const largest = k.largestBlock ? `${formatSf(k.largestBlock.totalSf)} · Fl ${k.largestBlock.floor}` : '—'

  return (
    <section className={styles.bar} aria-label="Key figures" data-print="hide">
      <KpiTile {...common} kpi="occupancy" testId="kpi-occupancy" label="Occupancy" pressed={highlight === 'occupancy'}
        value={k.occupancyPct === null ? '—' : `${formatNumber(Math.round(k.occupancyPct))}%`} />
      <KpiTile {...common} kpi="vacant" testId="kpi-vacant" label="Vacant" pressed={highlight === 'vacant'}
        value={formatSf(k.vacantSf)} sub={vacantSub(k)} subTestId="kpi-vacant-potential" />
      <KpiTile {...common} kpi="expiring" testId="kpi-expiring" label="Expiring within 12 months" pressed={highlight === 'expiring'}
        value={formatSf(k.expiringSf)} />
      <KpiTile {...common} kpi="largestBlock" testId="kpi-largest-block" label="Largest block" pressed={highlight === 'largestBlock'}
        value={largest} />
    </section>
  )
}
