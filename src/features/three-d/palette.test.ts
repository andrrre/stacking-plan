/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { findFits } from '../../domain/findFits'
import { buildStackModel, type FillKey, type SuiteVisual } from '../stack/suiteVisual'
import { FILL_KEYS, lookColours, lookKey, normaliseHex, overlayActive, parseRgba, readPalette, suiteLook } from './palette'

const TODAY = '2026-11-15'
const ODT = BUNDLED_BUILDINGS[0]

// The real token file, read the way the browser would resolve the custom properties.
const TOKENS = new Map(
  [...readFileSync('src/styles/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+):([^;]+);/g)]
    .map((m) => [m[1] ?? '', (m[2] ?? '').trim()]),
)
const resolve = (name: string): string => (TOKENS.get(name) ?? '').replace(/var\((--[\w-]+)\)/g, (_: string, n: string) => resolve(n))

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

  it('reads every fill from its --c-{fill} token, normalised to lowercase hex', () => {
    for (const k of FILL_KEYS) expect(p.fills[k], k).toBe(resolve(`--c-${k}`).toLowerCase())
    expect(p.fills.vacant).toBe('#f28c28')
    expect(p.fills.occupied).toBe('#1e3a6e')
  })

  it('reads the hatch, the committed pattern and the edges', () => {
    expect(p.hatch).toEqual({ hex: '#ffffff', alpha: 0.35 })
    expect(p.committedPattern).toEqual({ hex: '#3b3326', alpha: 0.14 })
    expect(p.edges.potential).toBe('#b45309')
    expect(p.accent).toBe('#c2185b')
  })

  it('reads the muted ink and the strong border the sketched city is drawn in', () => {
    expect(p.muted).toBe('#5b6475')
    expect(p.borderStrong).toBe('#b8c0cc')
  })

  it('falls back to grey for a missing or malformed token instead of failing', () => {
    const bare = readPalette(() => '')
    expect(bare.fills.vacant).toBe('#808080')
    expect(bare.hatch.alpha).toBe(0.35)
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
})

describe('suiteLook', () => {
  it('maps every availability status and overlay to its fill, pattern and edge', () => {
    const today = visuals()
    const jul = visuals({ asOf: '2027-07-01' })
    const cases: [SuiteVisual, string][] = [
      [find(today, '900'), 'occupied|none|none|solid|flat'],
      [find(today, '600'), 'expiring|none|expiring|solid|flat'],
      [find(today, '500'), 'vacant|hatch|none|solid|flat'],
      [find(today, '100'), 'common|none|none|solid|flat'],
      [find(today, '1010'), 'committed|committed|committed|solid|flat'],
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

  it('attaches the token colours: dashed potential edge, solid others, patterns by kind', () => {
    const jul = visuals({ asOf: '2027-07-01' })
    expect(lookColours(suiteLook(find(jul, '600'), false), p)).toEqual({
      base: '#fcd9b4', pattern: null, edge: { hex: '#b45309', px: 2, dashed: true },
    })
    const today = visuals()
    expect(lookColours(suiteLook(find(today, '500'), false), p).pattern).toEqual({ hex: '#ffffff', alpha: 0.35, kind: 'hatch' })
    expect(lookColours(suiteLook(find(today, '1010'), false), p)).toMatchObject({ pattern: { kind: 'committed' }, edge: { dashed: false } })
    expect(lookColours(suiteLook(find(today, '900'), false), p)).toEqual({ base: '#1e3a6e', pattern: null, edge: null })
  })
})
