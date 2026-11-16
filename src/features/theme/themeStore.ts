import type { StorageLike } from '../../app/state/storage'
import { loadTheme, resolveTheme, saveTheme, type Theme } from './themeStorage'

// The app's theme: the stored choice or, without one, the system's. It keeps data-theme on the root element
// (tokens.css switches every colour on it) and tells subscribers when the theme changes, so the WebGL scene
// can re-read its colours.

/** The system's colour-scheme preference: matchMedia('(prefers-color-scheme: dark)') in the browser. */
export type SystemScheme = { dark: () => boolean; subscribe: (onChange: () => void) => () => void }

export type ThemeStore = { get: () => Theme; subscribe: (onChange: () => void) => () => void; toggle: () => void }

type Deps = { storage: StorageLike | null; root: HTMLElement; system: SystemScheme | null }

export function createThemeStore({ storage, root, system }: Deps): ThemeStore {
  let chosen = loadTheme(storage)
  let theme = resolveTheme(chosen, system?.dark() ?? false)
  const listeners = new Set<() => void>()
  root.dataset.theme = theme

  const update = (next: Theme) => {
    if (next === theme) return
    theme = next
    root.dataset.theme = next
    listeners.forEach((fn) => fn())
  }
  system?.subscribe(() => {
    if (chosen === null) update(resolveTheme(null, system.dark()))
  })

  return {
    get: () => theme,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    toggle: () => {
      chosen = theme === 'dark' ? 'light' : 'dark'
      saveTheme(storage, chosen)
      update(chosen)
    },
  }
}

/** The browser's prefers-color-scheme query, or null where matchMedia does not exist (jsdom). */
export function browserScheme(): SystemScheme | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  return {
    dark: () => mq.matches,
    subscribe: (fn) => {
      mq.addEventListener('change', fn)
      return () => mq.removeEventListener('change', fn)
    },
  }
}
