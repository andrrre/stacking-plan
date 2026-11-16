import { describe, it, expect } from 'vitest'
import { tourKey } from './tourKeys'

const el = (html: string, pick = '#t'): Element => {
  document.body.innerHTML = html
  return document.querySelector(pick) as Element
}

describe('tourKey', () => {
  it('Escape exits, ← → step, Space plays or pauses, from the page', () => {
    const body = document.body
    expect(tourKey('Escape', body)).toBe('exit')
    expect(tourKey('ArrowLeft', body)).toBe('prev')
    expect(tourKey('ArrowRight', body)).toBe('next')
    expect(tourKey(' ', body)).toBe('toggle')
    expect(tourKey('a', body)).toBeNull()
  })

  it('a dialog keeps its own keys', () => {
    const t = el('<div role="dialog"><button id="t">x</button></div>')
    for (const k of ['Escape', 'ArrowLeft', ' ']) expect(tourKey(k, t)).toBeNull()
    expect(tourKey('Escape', el('<dialog open><p id="t">x</p></dialog>'))).toBeNull()
  })

  it('a text field or slider keeps its arrows and Space; Escape still ends the tour', () => {
    for (const html of ['<input id="t">', '<textarea id="t"></textarea>', '<div role="slider" id="t" tabindex="0"></div>', '<select id="t"></select>']) {
      const t = el(html)
      expect(tourKey('ArrowLeft', t)).toBeNull()
      expect(tourKey(' ', t)).toBeNull()
    }
    expect(tourKey('Escape', el('<div role="slider" id="t" tabindex="0"></div>'))).toBe('exit')
  })

  it('a focused button keeps Space (it presses the button) but not the arrows', () => {
    const t = el('<button id="t">Next</button>')
    expect(tourKey(' ', t)).toBeNull()
    expect(tourKey('ArrowRight', t)).toBe('next')
    expect(tourKey(' ', el('<a href="#x" id="t">x</a>'))).toBeNull()
  })

  it('no target (a window event) acts as the page', () => {
    expect(tourKey('ArrowRight', null)).toBe('next')
  })
})
