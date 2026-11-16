import type { FillKey, SuiteVisual } from '../stack/suiteVisual'

// What a suite box looks like in the 3D building: its fill, surface pattern, edge and ghosting. Pure: the
// colours come from the same CSS tokens as the 2D stack (read by the caller), so the two views cannot drift.

export const FILL_KEYS: readonly FillKey[] = [
  'occupied', 'expiring', 'vacant', 'potential', 'committed', 'common',
  'risk-le6', 'risk-le12', 'risk-le24', 'risk-le36', 'risk-gt36', 'risk-open',
]

export type Rgba = { hex: string; alpha: number }

export type Palette = {
  fills: Record<FillKey, string>
  hatch: Rgba // vacant stripes
  committedPattern: Rgba
  edges: { expiring: string; potential: string; committed: string; 'risk-gt36': string }
  accent: string
  text: string
  focus: string
  surface: string
  surface2: string
  border: string
  muted: string // the sketched city's ink
  borderStrong: string // its traffic
}

export type PatternKind = 'hatch' | 'committed' | 'none'
export type EdgeKind = 'expiring' | 'potential' | 'committed' | 'risk-gt36' | 'none'

/** The drawing recipe of one suite, before colours are attached. */
export type SuiteLook = { fill: FillKey; pattern: PatternKind; edge: EdgeKind; ghost: boolean; lifted: boolean }

const EDGE: Partial<Record<FillKey, EdgeKind>> = {
  expiring: 'expiring', potential: 'potential', committed: 'committed', 'risk-gt36': 'risk-gt36',
}
const PATTERN: Partial<Record<FillKey, PatternKind>> = { vacant: 'hatch', committed: 'committed' }

/** True when a search or a KPI highlight is active, i.e. some suite is dimmed. */
export function overlayActive(suites: readonly SuiteVisual[]): boolean {
  return suites.some((v) => v.dimmed)
}

/**
 * A dimmed suite becomes a ghost unless it is selected or focused (as in 2D, where those light up);
 * the suites that stay lit while an overlay is active lift out of the facade.
 */
export function suiteLook(v: SuiteVisual, active: boolean, focused = false): SuiteLook {
  return {
    fill: v.fill,
    pattern: PATTERN[v.fill] ?? 'none',
    edge: EDGE[v.fill] ?? 'none',
    ghost: v.dimmed && !v.selected && !focused,
    lifted: active && !v.dimmed,
  }
}

/** A stable key for a look; SuiteMaterials.apply uses it to skip suites whose look did not change. */
export function lookKey(l: SuiteLook): string {
  return [l.fill, l.pattern, l.edge, l.ghost ? 'ghost' : 'solid', l.lifted ? 'lifted' : 'flat'].join('|')
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

/** Reads every colour the 3D building needs from the CSS custom properties. */
export function readPalette(read: (name: string) => string): Palette {
  const hex = (name: string) => normaliseHex(read(name), GREY)
  const fills = Object.fromEntries(FILL_KEYS.map((k) => [k, hex(`--c-${k}`)])) as Record<FillKey, string>
  return {
    fills,
    hatch: parseRgba(read('--c-vacant-stripe'), { hex: '#ffffff', alpha: 0.35 }),
    committedPattern: parseRgba(read('--pat-committed'), { hex: '#3b3326', alpha: 0.14 }),
    edges: {
      expiring: hex('--c-expiring-edge'),
      potential: hex('--c-potential-edge'),
      committed: hex('--c-committed-edge'),
      'risk-gt36': hex('--c-risk-gt36-edge'),
    },
    accent: hex('--c-accent'),
    text: hex('--c-text'),
    focus: hex('--c-focus'),
    surface: hex('--c-surface'),
    surface2: hex('--c-surface-2'),
    border: hex('--c-border'),
    muted: hex('--c-text-muted'),
    borderStrong: hex('--c-border-strong'),
  }
}

/** Colours for one look: the fill, the pattern (or null) and the edge (or null), with how the edge is drawn. */
export type LookColours = {
  base: string
  pattern: (Rgba & { kind: Exclude<PatternKind, 'none'> }) | null
  edge: { hex: string; px: number; dashed: boolean } | null
}

export function lookColours(l: SuiteLook, p: Palette): LookColours {
  const pattern = l.pattern === 'hatch' ? { ...p.hatch, kind: 'hatch' as const }
    : l.pattern === 'committed' ? { ...p.committedPattern, kind: 'committed' as const }
      : null
  const edge = l.edge === 'none' ? null
    : { hex: p.edges[l.edge], px: l.edge === 'potential' ? 2 : 1.25, dashed: l.edge === 'potential' }
  return { base: p.fills[l.fill], pattern, edge }
}
