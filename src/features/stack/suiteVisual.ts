import { addDaysIso } from '../../domain/dates'
import { formatLongDate, formatMmYyyy, formatSf } from '../../domain/format'
import { riskBucket, statusAt } from '../../domain/status'
import type { Building, Candidate, Floor, ISODate, RiskBucket, StatusResult, Suite } from '../../domain/types'
import type { ColourMode } from '../../app/state/types'

// The one place that turns data into what a suite looks like and says (spec-technical §4, §5.6, §7).
// Pure: no React, no clock. Callers only feed it data.

export type FillKey =
  | 'occupied' | 'expiring' | 'vacant' | 'potential' | 'committed' | 'common'
  | 'risk-le6' | 'risk-le12' | 'risk-le24' | 'risk-le36' | 'risk-gt36' | 'risk-open'

/** Non-colour status cue drawn before the number: clock + lease end MM/YYYY (expiring) or lock + start MM/YYYY (committed). */
export type SuiteCue = { glyph: 'clock' | 'lock'; text: string }

export type SuiteLabel = {
  number: string
  primary: string // tenant | 'Vacant' | 'Potential' | 'Leased from 03/2027' | common-area name
  reason?: string // potential only, drawn after the primary text: 'Flamingo Row Media lease ends 04/2027'
  sf: string
  end?: string // MM/YYYY, occupied suites with an end date (expiring suites carry it in the cue)
  cue?: SuiteCue
  tag?: string // 'Vacant from 06/2027' (active vacating lease) | 'No end date' (open-ended)
}

export type SuiteVisual = {
  suite: Suite
  status: StatusResult
  risk: RiskBucket
  fill: FillKey
  label: SuiteLabel
  ariaLabel: string
  tooltip: string // native `title`
  dimmed: boolean
  matchRank: number | null
  modified: boolean
  selected: boolean
}

export type MatchRun = { rank: number; first: number; last: number }

export type FloorVisual = { number: number; plateSf: number; widthPct: number; suites: SuiteVisual[]; runs: MatchRun[] }

export type StackModel = { floors: FloorVisual[] } // sorted by number, descending

export type StackModelInput = {
  building: Building
  asOf: ISODate
  today: ISODate
  mode: ColourMode
  matches: readonly Candidate[]
  highlightIds: ReadonlySet<string> | null // a highlighted KPI tile replaces the match overlay
  modifiedIds: ReadonlySet<string>
  selectedSuiteId: string | null
}

const RISK_FILL: Record<'le6' | 'le12' | 'le24' | 'le36' | 'gt36' | 'openEnded', FillKey> = {
  le6: 'risk-le6', le12: 'risk-le12', le24: 'risk-le24', le36: 'risk-le36', gt36: 'risk-gt36', openEnded: 'risk-open',
}

const RISK_WORDS: Partial<Record<RiskBucket, string>> = {
  le6: '6 months or less', le12: '12 months or less', le24: '24 months or less', le36: '36 months or less', gt36: 'over 36 months',
}

type Context = Omit<StackModelInput, 'building' | 'matches'> & { ranks: ReadonlyMap<string, number> }

function availabilityFill(st: StatusResult): FillKey {
  return st.status === 'vacant' && st.overlay !== 'none' ? st.overlay : st.status
}

function fillFor(st: StatusResult, risk: RiskBucket, mode: ColourMode): FillKey {
  if (mode === 'availability' || risk === 'vacant' || risk === 'common') return availabilityFill(st)
  return RISK_FILL[risk]
}

/** "Vacant from MM/YYYY": an active lease the tenant is leaving, or plain vacant space freed after today. */
function vacatingFrom(st: StatusResult, today: ISODate): ISODate | null {
  if (st.status === 'vacant') return st.overlay === 'none' && st.availableFrom > today ? st.availableFrom : null
  if (st.status !== 'occupied' && st.status !== 'expiring') return null
  const { lease } = st
  return lease.vacating && lease.end !== null ? addDaysIso(lease.end, 1) : null
}

function primaryFor(s: Suite, st: StatusResult): string {
  switch (st.status) {
    case 'common': return s.name ?? 'Common area'
    case 'occupied':
    case 'expiring': return st.lease.tenant
    case 'vacant':
      if (st.overlay === 'potential') return 'Potential'
      if (st.overlay === 'committed') return `Leased from ${formatMmYyyy(st.nextLease.start)}`
      return 'Vacant'
  }
}

/** Why a potential suite may come free: "Flamingo Row Media lease ends 04/2027". */
function potentialReason(st: Extract<StatusResult, { overlay: 'potential' }>): string {
  return `${st.endedLease.tenant} lease ends ${formatMmYyyy(st.endedLease.end ?? st.availableFrom)}`
}

function tagFor(st: StatusResult, today: ISODate): string | undefined {
  const from = vacatingFrom(st, today)
  if (from) return `Vacant from ${formatMmYyyy(from)}`
  if (st.status === 'occupied' && st.openEnded) return 'No end date'
  return undefined
}

function labelFor(s: Suite, st: StatusResult, today: ISODate): SuiteLabel {
  const tag = tagFor(st, today)
  const label: SuiteLabel = { number: s.number, primary: primaryFor(s, st), sf: formatSf(s.areaSf), ...(tag && { tag }) }
  if (st.status === 'expiring' && st.lease.end !== null) return { ...label, cue: { glyph: 'clock', text: formatMmYyyy(st.lease.end) } }
  if (st.status === 'vacant' && st.overlay === 'committed') return { ...label, cue: { glyph: 'lock', text: formatMmYyyy(st.nextLease.start) } }
  if (st.status === 'vacant' && st.overlay === 'potential') return { ...label, reason: potentialReason(st) }
  if (st.status === 'occupied' && st.lease.end !== null) return { ...label, end: formatMmYyyy(st.lease.end) }
  return label
}

/** The status part of the aria-label, after "Suite N, floor F, ". */
function ariaStatus(s: Suite, st: StatusResult, today: ISODate): string {
  const sf = formatSf(s.areaSf)
  switch (st.status) {
    case 'common': return `${s.name ?? 'Common area'}, ${sf}, common area`
    case 'occupied':
    case 'expiring': {
      const { lease } = st
      const ends = lease.end === null ? 'no end date' : `lease ends ${formatLongDate(lease.end)}`
      const from = vacatingFrom(st, today)
      return `${lease.tenant}, ${sf}, ${st.status}, ${ends}${from ? `, vacant from ${formatLongDate(from)}` : ''}`
    }
    case 'vacant':
      if (st.overlay === 'potential') {
        return `vacant, ${sf}, potential: ${st.endedLease.tenant} lease ends ${formatLongDate(st.endedLease.end ?? st.availableFrom)}`
      }
      if (st.overlay === 'committed') {
        return `vacant, ${sf}, committed: ${st.nextLease.tenant} lease starts ${formatLongDate(st.nextLease.start)}`
      }
      return st.availableFrom > today ? `vacant, ${sf}, vacant from ${formatLongDate(st.availableFrom)}` : `vacant, ${sf}`
  }
}

type Marks = { risk: RiskBucket; mode: ColourMode; matchRank: number | null; modified: boolean; today: ISODate }

/** Spoken risk bucket for leased suites, in risk mode only (the fill is the only other risk cue). */
function riskWords(m: Marks): string | undefined {
  return m.mode === 'risk' ? RISK_WORDS[m.risk] : undefined
}

function ariaLabelFor(s: Suite, floorNumber: number, st: StatusResult, m: Marks): string {
  const parts = [`Suite ${s.number}`, `floor ${floorNumber}`, ariaStatus(s, st, m.today)]
  const risk = riskWords(m)
  if (risk) parts.push(`lease risk: ${risk}`)
  if (m.matchRank !== null) parts.push(`match ${m.matchRank}`)
  if (m.modified) parts.push('modified')
  return parts.join(', ')
}

function headline(st: StatusResult, primary: string): string {
  switch (st.status) {
    case 'common': return primary
    case 'occupied':
    case 'expiring': return st.lease.end === null ? st.lease.tenant : `${st.lease.tenant} · lease ends ${formatMmYyyy(st.lease.end)}`
    case 'vacant':
      if (st.overlay === 'potential') return `Potential · ${potentialReason(st)}`
      if (st.overlay === 'committed') return `${primary} · ${st.nextLease.tenant}`
      return primary
  }
}

function tooltipFor(s: Suite, floorNumber: number, st: StatusResult, label: SuiteLabel, m: Marks): string {
  const lines = [headline(st, label.primary), `Suite ${s.number} · Floor ${floorNumber} · ${label.sf}`]
  if (label.tag) lines.push(label.tag)
  const risk = riskWords(m)
  if (risk) lines.push(`Lease risk: ${risk}`)
  if (m.matchRank !== null) lines.push(`Match ${m.matchRank}`)
  if (m.modified) lines.push('Modified')
  return lines.join('\n')
}

function suiteVisual(s: Suite, floorNumber: number, ctx: Context): SuiteVisual {
  const status = statusAt(s, ctx.asOf, ctx.today)
  const risk = riskBucket(s, ctx.asOf, ctx.today)
  const matchRank = ctx.ranks.get(s.id) ?? null
  const marks: Marks = { risk, mode: ctx.mode, matchRank, modified: ctx.modifiedIds.has(s.id), today: ctx.today }
  const label = labelFor(s, status, ctx.today)
  const dimmed = ctx.highlightIds ? !ctx.highlightIds.has(s.id) : ctx.ranks.size > 0 && matchRank === null
  return {
    suite: s,
    status,
    risk,
    fill: fillFor(status, risk, ctx.mode),
    label,
    ariaLabel: ariaLabelFor(s, floorNumber, status, marks),
    tooltip: tooltipFor(s, floorNumber, status, label, marks),
    dimmed,
    matchRank,
    modified: marks.modified,
    selected: s.id === ctx.selectedSuiteId,
  }
}

/** Suite id → best (lowest) 1-based rank over the candidates. */
function rankMap(matches: readonly Candidate[]): ReadonlyMap<string, number> {
  return new Map(
    matches
      .flatMap((c, i) => c.suiteIds.map((id) => [id, i + 1] as const))
      .reverse(), // later entries win in a Map, so reverse to let the best rank win
  )
}

function runsFor(f: Floor, matches: readonly Candidate[]): MatchRun[] {
  return matches.flatMap((c, i) => {
    const idx = f.suites.flatMap((s, j) => (c.suiteIds.includes(s.id) ? [j] : []))
    return idx.length === 0 ? [] : [{ rank: i + 1, first: Math.min(...idx), last: Math.max(...idx) }]
  })
}

const plateOf = (f: Floor) => f.suites.reduce((sum, s) => sum + s.areaSf, 0)

export function buildStackModel(i: StackModelInput): StackModel {
  const matches = i.highlightIds ? [] : i.matches
  const ctx: Context = { ...i, ranks: rankMap(matches) }
  const maxPlate = Math.max(...i.building.floors.map(plateOf))
  const floors = [...i.building.floors].sort((a, b) => b.number - a.number).map((f): FloorVisual => {
    const plateSf = plateOf(f)
    return {
      number: f.number,
      plateSf,
      widthPct: maxPlate > 0 ? (plateSf / maxPlate) * 100 : 100,
      suites: f.suites.map((s) => suiteVisual(s, f.number, ctx)),
      runs: runsFor(f, matches),
    }
  })
  return { floors }
}
