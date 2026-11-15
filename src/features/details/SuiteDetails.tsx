import { selectBuilding } from '../../app/state/selectBuilding'
import { useAppState } from '../../app/state/useAppState'
import { monthsBetweenIso } from '../../domain/dates'
import { formatLongDate, formatPsf, formatSf } from '../../domain/format'
import { statusAt } from '../../domain/status'
import type { ISODate, Lease, StatusResult, Suite } from '../../domain/types'
import { combineText, locate, monthsText, shownLease, statusText } from './suiteFacts'
import styles from './details.module.css'

type Props = { suiteId: string }

function Row({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd data-testid={testId}>{children}</dd>
    </div>
  )
}

function leaseTerm(l: Lease): string {
  return `${formatLongDate(l.start)} → ${l.end === null ? 'No end date' : formatLongDate(l.end)}`
}

type FactProps = { suite: Suite; st: StatusResult; neighbours: readonly Suite[]; asOf: ISODate }

function FactRows({ suite, st, neighbours, asOf }: FactProps) {
  const lease = shownLease(st)
  const leasable = suite.kind === 'leasable'
  return (
    <dl className={styles.rows}>
      <Row label="Size">{formatSf(suite.areaSf)}</Row>
      {lease && <Row label="Tenant">{lease.tenant}</Row>}
      {st.status === 'vacant' && st.overlay === 'potential' && (
        <Row label="Ended lease">{st.endedLease.tenant} · ended {formatLongDate(st.endedLease.end ?? asOf)}</Row>
      )}
      {lease && <Row label="Rent">{formatPsf(lease.rentPsf)} <span className={styles.unit}>/SF/yr</span></Row>}
      {leasable && st.status === 'vacant' && st.overlay !== 'committed' && suite.askingRentPsf !== undefined && (
        <Row label="Asking rent">{formatPsf(suite.askingRentPsf)} <span className={styles.unit}>/SF/yr</span></Row>
      )}
      {lease && <Row label="Lease start">{formatLongDate(lease.start)}</Row>}
      {lease && <Row label="Lease end">{lease.end === null ? 'No end date' : formatLongDate(lease.end)}</Row>}
      {lease && lease.end !== null && <Row label="Remaining">{monthsText(monthsBetweenIso(asOf, lease.end))}</Row>}
      {leasable && <Row label="Combine" testId="suite-combine">{combineText(neighbours)}</Row>}
    </dl>
  )
}

export function SuiteDetails({ suiteId }: Props) {
  const { state, dispatch } = useAppState()
  const found = locate(selectBuilding(state), suiteId)
  if (!found) return null
  const { suite, floor, neighbours } = found
  const { asOf, today } = state
  const st = statusAt(suite, asOf, today)
  const upcoming = suite.leases.filter((l) => l.start > asOf).sort((a, b) => a.start.localeCompare(b.start))

  return (
    <section className={styles.details} data-testid="suite-details" data-status={st.status} aria-label={`Suite ${suite.number} details`}>
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>Suite {suite.number}</h2>
          <p className={styles.where}>Floor {floor}{suite.name ? ` · ${suite.name}` : ''}</p>
        </div>
        <button type="button" className={styles.close} aria-label="Close details" onClick={() => dispatch({ type: 'select', selection: null })}>×</button>
      </header>
      <p className={styles.status} data-status={st.status} data-overlay={st.status === 'vacant' ? st.overlay : undefined}>
        {statusText(st, today)}
      </p>
      <FactRows suite={suite} st={st} neighbours={neighbours} asOf={asOf} />
      {upcoming.length > 0 && (
        <div className={styles.upcoming}>
          <h3 className={styles.sub}>Upcoming leases</h3>
          <ul>
            {upcoming.map((l) => (
              <li key={l.id}>
                <strong>{l.tenant}</strong>
                <span>{leaseTerm(l)} · {formatPsf(l.rentPsf)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* slot:suite-actions (S11) */}
    </section>
  )
}
