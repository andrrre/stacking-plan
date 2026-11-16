/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveTheme, THEME_KEY } from './themeStorage'

// public/theme-init.js runs from <head> before the app's module, so the first paint already has the stored
// theme. It must read exactly what themeStorage writes and leave everything else to the app.

const SCRIPT = readFileSync('public/theme-init.js', 'utf8')
const run = () => new Function(SCRIPT)() // runs the classic script as the browser would
const root = document.documentElement

afterEach(() => {
  localStorage.clear()
  delete root.dataset.theme
  vi.restoreAllMocks()
})

describe('theme-init.js', () => {
  it('sets data-theme from the choice themeStorage saved', () => {
    for (const theme of ['light', 'dark'] as const) {
      saveTheme(localStorage, theme)
      run()
      expect(root.dataset.theme).toBe(theme)
    }
  })

  it('reads the same key the app stores under', () => {
    expect(SCRIPT).toContain(`'${THEME_KEY}'`)
  })

  it('leaves data-theme unset for nothing stored or anything malformed (the app then follows the system)', () => {
    for (const raw of [null, 'dark', '"blue"', '{"theme":"dark"}', '']) {
      if (raw === null) localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, raw)
      run()
      expect(root.dataset.theme, String(raw)).toBeUndefined()
    }
  })

  it('does not throw when storage is unreadable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(run).not.toThrow()
    expect(root.dataset.theme).toBeUndefined()
  })

  it('is loaded from <head> as a classic script, before the app module', () => {
    const html = readFileSync('index.html', 'utf8')
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('<script src="/theme-init.js"></script>')
    expect(html.indexOf('/theme-init.js')).toBeLessThan(html.indexOf('/src/main.tsx'))
  })
})
