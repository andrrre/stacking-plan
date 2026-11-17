import { FILL_KEYS } from '../../app/state/legendKeys'
import type { FillKey, SuiteVisual } from '../stack/suiteVisual'

// What a suite box looks like in the 3D building: its fill, side, surface pattern, edge and ghosting. Pure: the
// colours come from the same CSS tokens as the 2D stack (read by the caller, resolved for the current light or
// dark theme), so the two views cannot drift.

export { FILL_KEYS }

export type Rgba = { hex: string; alpha: number }

export type Palette = {
  fills: Record<FillKey, string> // front faces
  sides: Record<FillKey, string> // side faces
  hatch: string // the vacant hatch's second band
  edges: { potential: string; committed: string; 'risk-gt36': string }
  text: string
  muted: string
  bg: string
  surface: string // the stage (card) colour; ghosts fade towards it
  border: string
  roof: string // slabs, roof caps and the sketched city
  roofEdge: string
  shadow: Rgba // the contact shadow under the building
  match: string // the match accent (rings, rank badges): the previewed move's flying block
  matchInk: string // ink on the match accent: the flying block's edges
  fit: { wood: string; fabric: string; accent: string; plant: string } // the tour's illustrative fit-out
}

export type PatternKind = 'hatch' | 'none'
export type EdgeKind = 'potential' | 'committed' | 'risk-gt36' | 'none'

/**
 * The drawing recipe of one suite, before colours are attached. `ghost`: dimmed by a search or KPI highlight;
 * `faded`: left out by the legend filter (FILTER_ALPHA). A suite can be both and is then as faint as the fainter.
 */
export type SuiteLook = { fill: FillKey; pattern: PatternKind; edge: EdgeKind; ghost: boolean; faded: boolean; lifted: boolean }

/** How opaque a suite the legend filter leaves out is drawn (the 2D stack's --filter-opacity). */
export const FILTER_ALPHA = 0.28

// Potential and committed carry a 1.5px inset outline; the palest risk step keeps an edge on the card.
const EDGE: Partial<Record<FillKey, EdgeKind>> = { potential: 'potential', committed: 'committed', 'risk-gt36': 'risk-gt36' }
const PATTERN: Partial<Record<FillKey, PatternKind>> = { vacant: 'hatch' }

/** True when a search or a KPI highlight is active, i.e. some suite is dimmed. */
export function overlayActive(suites: readonly SuiteVisual[]): boolean {
  return suites.some((v) => v.dimmed)
}

/**
 * A dimmed suite becomes a ghost, and a filtered one fades, unless it is selected or focused (as in 2D, where
 * those light up); the suites that stay lit while a search or highlight is active lift out of the facade.
 */
export function suiteLook(v: SuiteVisual, active: boolean, focused = false): SuiteLook {
  const lit = v.selected || focused
  return {
    fill: v.fill,
    pattern: PATTERN[v.fill] ?? 'none',
    edge: EDGE[v.fill] ?? 'none',
    ghost: v.dimmed && !lit,
    faded: v.filtered && !lit,
    lifted: active && !v.dimmed,
  }
}

/** A stable key for a look; SuiteMaterials.apply uses it to skip suites whose look did not change. */
export function lookKey(l: SuiteLook): string {
  return [l.fill, l.pattern, l.edge, l.ghost ? 'ghost' : 'solid', l.faded ? 'faded' : 'full', l.lifted ? 'lifted' : 'flat'].join('|')
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const RGBA = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i

const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

/** '#abc' or '#aabbcc' (any case) → '#aabbcc'; anything else → the fallback. */
export function normaliseHex(raw: string, fallback: string): string {
  const s = raw.trim()
  if (!HEX.test(s)) return fallback
  const h = s.slice(1).toLowerCase()
  return h.length === 3 ? `#${[...h].map((c) => c + c).join('')}` : `#${h}`
}

/** The first rgb()/rgba() colour in a CSS value (a token or a gradient), or the fallback. */
export function parseRgba(raw: string, fallback: Rgba): Rgba {
  const m = RGBA.exec(raw)
  if (!m) return fallback
  const [r, g, b] = [m[1], m[2], m[3]].map(Number) as [number, number, number]
  return { hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`, alpha: m[4] === undefined ? 1 : Number(m[4]) }
}

const GREY = '#808080'

/** A colour as CSS reports it ('#abc', '#aabbcc', 'rgb()' or 'rgba()', alpha dropped) → '#aabbcc'; else the fallback. */
export function parseColour(raw: string, fallback: string): string {
  const hex = normaliseHex(raw, '')
  return hex || parseRgba(raw, { hex: fallback, alpha: 1 }).hex
}

/** Reads every colour the 3D building needs from the CSS custom properties (resolved colours). */
export function readPalette(read: (name: string) => string): Palette {
  const hex = (name: string) => parseColour(read(name), GREY)
  const byFill = (suffix: string) => Object.fromEntries(FILL_KEYS.map((k) => [k, hex(`--c-${k}${suffix}`)])) as Record<FillKey, string>
  return {
    fills: byFill(''),
    sides: byFill('-side'),
    hatch: hex('--c-vacant-2'),
    edges: { potential: hex('--c-potential-edge'), committed: hex('--c-committed-edge'), 'risk-gt36': hex('--c-risk-gt36-edge') },
    text: hex('--c-text'),
    muted: hex('--c-text-muted'),
    bg: hex('--c-bg'),
    surface: hex('--c-surface'),
    border: hex('--c-border'),
    roof: hex('--c-roof'),
    roofEdge: hex('--c-roof-edge'),
    shadow: parseRgba(read('--c-shadow'), { hex: '#000000', alpha: 0.12 }),
    match: hex('--c-match'),
    matchInk: hex('--c-match-ink'),
    fit: { wood: hex('--c-fit-wood'), fabric: hex('--c-fit-fabric'), accent: hex('--c-fit-accent'), plant: hex('--c-fit-plant') },
  }
}

/** Colours for one look: front and side, the hatch (or null), the edge (or null) and the tone a ghost fades to. */
export type LookColours = {
  base: string
  side: string
  pattern: { hex: string; kind: Exclude<PatternKind, 'none'> } | null
  edge: { hex: string; px: number } | null
  ghostTone: string
}

export function lookColours(l: SuiteLook, p: Palette): LookColours {
  return {
    base: p.fills[l.fill],
    side: p.sides[l.fill],
    pattern: l.pattern === 'hatch' ? { hex: p.hatch, kind: 'hatch' } : null,
    edge: l.edge === 'none' ? null : { hex: p.edges[l.edge], px: l.edge === 'risk-gt36' ? 1.25 : 1.5 },
    ghostTone: p.surface,
  }
}
