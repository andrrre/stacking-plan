import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { Color, Group, InstancedMesh, BoxGeometry, Mesh, MeshBasicMaterial } from 'three'
import { readPalette } from '../palette'
import { statusColours, statusColoured, toneColours } from './interiorParts'

// The real tokens, one theme at a time (as palette.test.ts reads them).
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
const THEMES = [['light', readPalette(resolveIn(false))], ['dark', readPalette(resolveIn(true))]] as const

describe('statusColours', () => {
  it.each(THEMES)('%s: holds the vacant, potential, match and every coloured status fill, side and edge', (_t, p) => {
    const s = statusColours(p)
    for (const hex of [p.fills.vacant, p.sides.vacant, p.hatch, p.fills.potential, p.edges.potential, p.match, p.fills.expiring, p.fills.committed]) {
      expect(s.has(hex), hex).toBe(true)
    }
  })
})

describe('toneColours', () => {
  it.each(THEMES)('%s: no tone of the fit-out is a status colour', (_t, p) => {
    const s = statusColours(p)
    for (const [tone, c] of Object.entries(toneColours(p))) expect(s.has(`#${c.getHexString()}`), tone).toBe(false)
  })
})

describe('statusColoured', () => {
  const [, p] = THEMES[0]
  it('counts meshes and instances drawn in a status colour, and nothing else', () => {
    const g = new Group()
    g.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: p.roof })))
    expect(statusColoured(g, p)).toBe(0)
    g.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: p.fills.vacant })))
    expect(statusColoured(g, p)).toBe(1)
    const inst = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 3)
    inst.setColorAt(0, new Color(p.surface))
    inst.setColorAt(1, new Color(p.match))
    inst.setColorAt(2, new Color(p.fills.potential))
    g.add(inst)
    expect(statusColoured(g, p)).toBe(3)
  })
})
