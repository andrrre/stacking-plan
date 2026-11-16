/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { findFits } from '../../domain/findFits'
import { buildStackModel, type FillKey, type SuiteVisual } from '../stack/suiteVisual'
import { FILL_KEYS, lookColours, lookKey, normaliseHex, overlayActive, parseColour, parseRgba, readPalette, suiteLook } from './palette'

const TODAY = '2026-11-15'
const ODT = BUNDLED_BUILDINGS[0]

// The real token file, read the way the browser would resolve the custom properties for one theme: nested
// var()s substituted, then light-dark(LIGHT, DARK) reduced to the theme's side.
const TOKENS = new Map(
  [...readFileSync('src/styles/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+):([^;]+);/g)]
    .map((m) => [m[1] ?? '', (m[2] ?? '').trim()]),
)
const LIGHT_DARK = /light-dark\(\s*((?:[^,()]|\([^()]*\))+?)\s*,\s*((?:[^,()]|\([^()]*\))+?)\s*\)/g
const resolveIn = (dark: boolean) => {
  const resolve = (name: string): string => (TOKENS.get(name) ?? '')
    .replace(/var\((--[\w-]+)\)/g, (_: string, n: string) => resolve(n))
    .replace(LIGHT_DARK, (_: string, l: string, d: string) => (dark ? d : l))
  return resolve
}
const resolve = resolveIn(false)
const resolveDark = resolveIn(true)

function visuals(over: { mode?: 'availability' | 'risk'; asOf?: string; minSf?: number } = {}): SuiteVisual[] {
  const asOf = over.asOf ?? TODAY
  const matches = over.minSf ? findFits(ODT, { minSf: over.minSf, includePotential: true }, asOf, TODAY) : []
  return buildStackModel({
    building: ODT, asOf, today: TODAY, mode: over.mode ?? 'availability', matches, highlightIds: null, modifiedIds: new Set(), selectedSuiteId: null,
  }).floors.flatMap((f) => f.suites)
}
const find = (vs: readonly SuiteVisual[], n: string) => vs.find((v) => v.suite.number === n) as SuiteVisual

describe('readPalette', () => {
  const p = readPalette(resolve)
  const d = readPalette(resolveDark)

  it('reads every front and side colour from its --c-{fill} and --c-{fill}-side token, as lowercase hex', () => {
    for (const k of FILL_KEYS) {
      expect(p.fills[k], k).toBe(resolve(`--c-${k}`).toLowerCase())
      expect(p.sides[k], k).toBe(resolve(`--c-${k}-side`).toLowerCase())
      expect(d.fills[k], k).toBe(resolveDark(`--c-${k}`).toLowerCase())
    }
  })

  it('has the Night palette in light: crimson vacant, grey occupied, gold expiring', () => {
    expect(p.fills.vacant).toBe('#c62f3b')
    expect(p.sides.vacant).toBe('#97222c')
    expect(p.hatch).toBe('#b82a35')
    expect(p.fills.occupied).toBe('#e3e6ea')
    expect(p.sides.occupied).toBe('#ccd1d8')
    expect(p.fills.expiring).toBe('#e8c25a')
    expect(p.edges.potential).toBe('#c62f3b')
    expect(p.edges.committed).toBe('#3fa36b')
  })

  it('has the Night palette in dark: same status hues, dark surfaces', () => {
    expect(d.fills.vacant).toBe('#ff5c66')
    expect(d.hatch).toBe('#f2505a')
    expect(d.fills.occupied).toBe('#2e343c')
    expect(d.sides.occupied).toBe('#252a31')
    expect(d.fills.expiring).toBe('#e8c25a')
    expect(d.sides.expiring).toBe('#bf9d42')
    expect(d.surface).toBe('#1a1e23')
    expect(d.roof).toBe('#2a3038')
    expect(d.roofEdge).toBe('#3a424c')
  })

  it('reads the neutrals the slabs and the sketched city are drawn in', () => {
    expect(p.roof).toBe('#e9ecf0')
    expect(p.roofEdge).toBe('#cdd2d9')
    expect(p.muted).toBe('#5b636e')
    expect(p.surface).toBe('#ffffff')
  })

  it('falls back to grey for a missing or malformed token instead of failing', () => {
    const bare = readPalette(() => '')
    expect(bare.fills.vacant).toBe('#808080')
    expect(bare.hatch).toBe('#808080')
  })
})

describe('colour parsing', () => {
  it('normaliseHex', () => {
    expect(normaliseHex(' #ABC ', '#000000')).toBe('#aabbcc')
    expect(normaliseHex('#A9CFF2', '#000000')).toBe('#a9cff2')
    for (const bad of ['', 'red', '#12', '#1234567', 'rgb(1,2,3)']) expect(normaliseHex(bad, '#000000')).toBe('#000000')
  })

  it('parseRgba takes the first rgb()/rgba() in a value', () => {
    expect(parseRgba('repeating-linear-gradient(45deg,rgba(59,51,38,.14) 0 2px,transparent 2px 6px)', { hex: '#000000', alpha: 1 }))
      .toEqual({ hex: '#3b3326', alpha: 0.14 })
    expect(parseRgba('rgb(255, 0, 10)', { hex: '#000000', alpha: 1 })).toEqual({ hex: '#ff000a', alpha: 1 })
    expect(parseRgba('none', { hex: '#123456', alpha: 0.5 })).toEqual({ hex: '#123456', alpha: 0.5 })
  })

  it('parseColour takes hex or the rgb() a computed style reports', () => {
    expect(parseColour('#C62F3B', '#000000')).toBe('#c62f3b')
    expect(parseColour('rgb(198, 47, 59)', '#000000')).toBe('#c62f3b')
    expect(parseColour('rgba(198, 47, 59, 0.5)', '#000000')).toBe('#c62f3b')
    expect(parseColour('light-dark(#fff, #000)', '#808080')).toBe('#808080')
  })
})

describe('suiteLook', () => {
  it('maps every availability status and overlay to its fill, pattern and edge', () => {
    const today = visuals()
    const jul = visuals({ asOf: '2027-07-01' })
    const cases: [SuiteVisual, string][] = [
      [find(today, '900'), 'occupied|none|none|solid|flat'],
      [find(today, '600'), 'expiring|none|none|solid|flat'],
      [find(today, '500'), 'vacant|hatch|none|solid|flat'],
      [find(today, '100'), 'common|none|none|solid|flat'],
      [find(today, '1010'), 'committed|none|committed|solid|flat'],
      [find(jul, '600'), 'potential|none|potential|solid|flat'],
    ]
    for (const [v, key] of cases) expect(lookKey(suiteLook(v, false)), v.suite.number).toBe(key)
  })

  it('maps every lease-risk bucket; vacant space keeps its hatch in risk mode', () => {
    const risk = visuals({ mode: 'risk' })
    const fills = new Set(risk.map((v) => v.fill))
    for (const f of ['risk-le6', 'risk-le12', 'risk-le24', 'risk-gt36'] as FillKey[]) expect(fills.has(f), f).toBe(true)
    for (const v of risk) {
      const l = suiteLook(v, false)
      expect(l.fill).toBe(v.fill)
      expect(l.edge).toBe(v.fill === 'risk-gt36' ? 'risk-gt36' : l.edge)
    }
    expect(suiteLook(find(risk, '500'), false).pattern).toBe('hatch')
  })

  it('ghosts dimmed suites and lifts the lit ones while a search is active', () => {
    const vs = visuals({ minSf: 10_000 })
    expect(overlayActive(vs)).toBe(true)
    expect(overlayActive(visuals())).toBe(false)
    expect(suiteLook(find(vs, '500'), true)).toMatchObject({ ghost: false, lifted: true })
    expect(suiteLook(find(vs, '600'), true)).toMatchObject({ ghost: true, lifted: false })
  })

  it('does not ghost a dimmed suite that is selected or focused', () => {
    const v = find(visuals({ minSf: 10_000 }), '600')
    expect(suiteLook({ ...v, selected: true }, true).ghost).toBe(false)
    expect(suiteLook(v, true, true).ghost).toBe(false)
  })
})

describe('lookColours', () => {
  const p = readPalette(resolve)

  it('attaches the token colours: potential and committed outlines, the vacant hatch, fronts and sides', () => {
    const jul = visuals({ asOf: '2027-07-01' })
    expect(lookColours(suiteLook(find(jul, '600'), false), p)).toEqual({
      base: '#fbe6e8', side: '#f1cace', pattern: null, edge: { hex: '#c62f3b', px: 1.5 }, ghostTone: '#ffffff',
    })
    const today = visuals()
    expect(lookColours(suiteLook(find(today, '500'), false), p)).toMatchObject({ base: '#c62f3b', side: '#97222c', pattern: { hex: '#b82a35', kind: 'hatch' } })
    expect(lookColours(suiteLook(find(today, '1010'), false), p)).toMatchObject({ pattern: null, edge: { hex: '#3fa36b', px: 1.5 } })
    expect(lookColours(suiteLook(find(today, '900'), false), p)).toEqual({ base: '#e3e6ea', side: '#ccd1d8', pattern: null, edge: null, ghostTone: '#ffffff' })
    expect(lookColours(suiteLook(find(today, '600'), false), p).edge).toBeNull()
  })

  it('ghosts fade towards the dark stage in the dark theme', () => {
    expect(lookColours(suiteLook(find(visuals(), '900'), false), readPalette(resolveDark)).ghostTone).toBe('#1a1e23')
  })
})
