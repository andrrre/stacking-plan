import { useEffect, useRef, type ReactNode } from 'react'
import { selectBuilding } from '../../app/state/selectBuilding'
import { useAppState } from '../../app/state/useAppState'
import { monthsBetweenIso } from '../../domain/dates'
import { formatLongDate, formatPsf, formatSf } from '../../domain/format'
import { statusAt } from '../../domain/status'
import type { Floor, ISODate, Lease, StatusResult, Suite } from '../../domain/types'
import { takeDetailsFocus } from '../scenario/detailsFocus'
import { SuiteActions } from '../scenario/SuiteActions'
import { legendLabel } from '../stack/legendEntries'
import { DetailsActions } from './DetailsActions'
import { FloorGlance } from './FloorGlance'
import { combineText, contiguousOnFloor, leaseText, locate, monthsText, shownLease, statusKey, statusText, tenantLine } from './suiteFacts'
import styles from './details.module.css'

// The suite details in the right drawer: a card with the title, status chip, tenant line, the Floor / Size /
// Lease / Contiguous grid and the two actions, the rest of the suite's facts and the what-if actions under it;
// then "Floor N at a glance".

type Props = { suiteId: string }

function Row({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd data-testid={testId}>{children}</dd>
    </div>
  )
}

function Cell({ label, children, testId }: { label: string; children: ReactNode; testId: string }) {
  return (
    <div className={styles.cell}>
      <dt>{label}</dt>
      <dd data-testid={testId}>{children}</dd>
    </div>
  )
}

function leaseTerm(l: Lease): string {
  return `${formatLongDate(l.start)} → ${l.end === null ? 'No end date' : formatLongDate(l.end)}`
}

type FactProps = { suite: Suite; st: StatusResult; neighbours: readonly Suite[]; asOf: ISODate; today: ISODate }

/** The facts the grid does not hold: status in full, rent, exact lease dates, time left, what it can combine with. */
function FactRows({ suite, st, neighbours, asOf, today }: FactProps) {
  const lease = shownLease(st)
  const leasable = suite.kind === 'leasable'
  return (
    <dl className={styles.rows}>
      <Row label="Status" testId="suite-status">{statusText(st, today)}</Row>
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

function Upcoming({ leases }: { leases: readonly Lease[] }) {
  if (leases.length === 0) return null
  return (
    <div className={styles.upcoming}>
      <h3 className={styles.sub}>Upcoming leases</h3>
      <ul>
        {leases.map((l) => (
          <li key={l.id}>
            <strong>{l.tenant}</strong>
            <span>{leaseTerm(l)} · {formatPsf(l.rentPsf)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

type GridProps = { suite: Suite; st: StatusResult; floor: Floor }

function Grid({ suite, st, floor }: GridProps) {
  const { state } = useAppState()
  const block = contiguousOnFloor(floor, suite.id, state.asOf, state.today, state.req.includePotential)
  return (
    <dl className={styles.grid} data-testid="suite-grid">
      <Cell label="Floor" testId="fact-floor">{floor.number}</Cell>
      <Cell label="Size" testId="fact-size">{formatSf(suite.areaSf)}</Cell>
      <Cell label="Lease" testId="fact-lease">{leaseText(st, state.today)}</Cell>
      <Cell label="Contiguous on floor" testId="fact-contiguous">{block === null ? '—' : formatSf(block)}</Cell>
    </dl>
  )
}

export function SuiteDetails({ suiteId }: Props) {
  const { state } = useAppState()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (takeDetailsFocus(suiteId)) headingRef.current?.focus()
  }, [suiteId])
  const building = selectBuilding(state)
  const found = locate(building, suiteId)
  const floor = building.floors.find((f) => f.number === found?.floor)
  if (!found || !floor) return null
  const { suite, neighbours } = found
  const { asOf, today } = state
  const st = statusAt(suite, asOf, today)
  const upcoming = suite.leases.filter((l) => l.start > asOf).sort((a, b) => a.start.localeCompare(b.start))

  return (
    <section className={styles.details} data-testid="suite-details" data-status={st.status} aria-label={`Suite ${suite.number} details`}>
      <div className={styles.card}>
        <header className={styles.head}>
          <h2 ref={headingRef} className={styles.title} tabIndex={-1}>Suite {suite.number}</h2>
          <p className={styles.status} data-testid="suite-chip" data-status={st.status} data-overlay={st.status === 'vacant' ? st.overlay : undefined}>
            {legendLabel(statusKey(st))}
          </p>
        </header>
        <p className={styles.tenant} data-testid="suite-tenant">{tenantLine(suite, st)}</p>
        <Grid suite={suite} st={st} floor={floor} />
        <DetailsActions floor={floor} suite={suite} />
        <FactRows suite={suite} st={st} neighbours={neighbours} asOf={asOf} today={today} />
        <Upcoming leases={upcoming} />
        <SuiteActions suite={suite} st={st} asOf={asOf} />
      </div>
      <FloorGlance floor={floor.number} suiteId={suite.id} />
    </section>
  )
}
