import { describe, it, expect, vi } from 'vitest'
import type { StorageLike } from '../../app/state/storage'
import { createThemeStore, type SystemScheme } from './themeStore'
import { THEME_KEY } from './themeStorage'

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) } }
}

/** A stand-in for matchMedia('(prefers-color-scheme: dark)') whose answer the test can change. */
function fakeSystem(dark: boolean): SystemScheme & { set: (dark: boolean) => void } {
  const listeners = new Set<() => void>()
  let now = dark
  return {
    dark: () => now,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    set: (d) => {
      now = d
      listeners.forEach((fn) => fn())
    },
  }
}

const freshRoot = () => document.createElement('html')

describe('createThemeStore', () => {
  it('sets data-theme on the root straight away, from the stored choice', () => {
    const root = freshRoot()
    const store = createThemeStore({ storage: memoryStorage({ [THEME_KEY]: '"dark"' }), root, system: fakeSystem(false) })
    expect(store.get()).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
  })

  it('with nothing stored it follows the system, and keeps following it when the system changes', () => {
    const root = freshRoot()
    const system = fakeSystem(false)
    const store = createThemeStore({ storage: memoryStorage(), root, system })
    const seen = vi.fn()
    store.subscribe(seen)
    expect(root.dataset.theme).toBe('light')
    system.set(true)
    expect(store.get()).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('toggle flips the theme, saves it and notifies; the system no longer moves it', () => {
    const root = freshRoot()
    const storage = memoryStorage()
    const system = fakeSystem(false)
    const store = createThemeStore({ storage, root, system })
    const seen = vi.fn()
    const off = store.subscribe(seen)
    store.toggle()
    expect(store.get()).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
    expect(storage.data.get(THEME_KEY)).toBe('"dark"')
    system.set(false)
    expect(store.get()).toBe('dark')
    store.toggle()
    expect(root.dataset.theme).toBe('light')
    expect(seen).toHaveBeenCalledTimes(2)
    off()
    store.toggle()
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('ignores an invalid stored value and works without storage or a system query', () => {
    const root = freshRoot()
    const store = createThemeStore({ storage: memoryStorage({ [THEME_KEY]: '"sepia"' }), root, system: null })
    expect(store.get()).toBe('light')
    store.toggle()
    expect(root.dataset.theme).toBe('dark')
    expect(createThemeStore({ storage: null, root: freshRoot(), system: fakeSystem(true) }).get()).toBe('dark')
  })
})
