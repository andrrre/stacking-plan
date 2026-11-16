import { useSyncExternalStore } from 'react'
import { browserStorage } from '../../app/state/storage'
import type { Theme } from './themeStorage'
import { browserScheme, createThemeStore, type ThemeStore } from './themeStore'

let store: ThemeStore | null = null

/** The app's one theme store, created on first use (main.tsx calls this before the first render: no flash). */
export function appThemeStore(): ThemeStore {
  store ??= createThemeStore({ storage: browserStorage(), root: document.documentElement, system: browserScheme() })
  return store
}

/** The current theme ('light' | 'dark'), re-rendering when it changes, and the toggle. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const s = appThemeStore()
  const theme = useSyncExternalStore(s.subscribe, s.get, s.get)
  return { theme, toggle: s.toggle }
}
