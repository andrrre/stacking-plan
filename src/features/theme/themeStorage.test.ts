import { describe, it, expect } from 'vitest'
import type { StorageLike } from '../../app/state/storage'
import { THEME_KEY, loadTheme, resolveTheme, saveTheme } from './themeStorage'

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) } }
}

const throwing: StorageLike = {
  getItem: () => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('QuotaExceededError') },
}

describe('theme storage', () => {
  it('has no choice when nothing is stored, there is no storage, or storage throws', () => {
    expect(loadTheme(memoryStorage())).toBeNull()
    expect(loadTheme(null)).toBeNull()
    expect(loadTheme(throwing)).toBeNull()
  })

  it('has no choice for bad JSON or a value that is not light or dark', () => {
    for (const raw of ['{nope', '"Dark"', '"system"', 'true', '1', 'null', '""']) {
      expect(loadTheme(memoryStorage({ [THEME_KEY]: raw })), raw).toBeNull()
    }
  })

  it('round-trips light and dark under stackmatch.v1.theme', () => {
    const storage = memoryStorage()
    saveTheme(storage, 'dark')
    expect(storage.data.get('stackmatch.v1.theme')).toBe('"dark"')
    expect(loadTheme(storage)).toBe('dark')
    saveTheme(storage, 'light')
    expect(loadTheme(storage)).toBe('light')
  })

  it('a failed save is silent', () => {
    expect(() => saveTheme(throwing, 'dark')).not.toThrow()
    expect(() => saveTheme(null, 'dark')).not.toThrow()
  })
})

describe('resolveTheme', () => {
  it('a stored choice wins over the system setting', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('without a choice it follows the system', () => {
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
  })
})
