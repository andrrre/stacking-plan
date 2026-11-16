import { z } from 'zod'
import type { StorageLike } from '../../app/state/storage'

// The light/dark choice, saved in localStorage (a viewing preference, not in the URL). Nothing stored means
// "follow the system".

export const THEME_KEY = 'stackmatch.v1.theme'

export const ThemeSchema = z.enum(['light', 'dark'])
export type Theme = z.infer<typeof ThemeSchema>

/** The stored choice; null when nothing valid is stored (missing, malformed or unreadable). */
export function loadTheme(storage: StorageLike | null): Theme | null {
  try {
    const raw = storage?.getItem(THEME_KEY)
    if (raw === null || raw === undefined) return null
    const parsed = ThemeSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function saveTheme(storage: StorageLike | null, theme: Theme): void {
  try {
    storage?.setItem(THEME_KEY, JSON.stringify(theme))
  } catch {
    // ignored by design, as for the other saved settings
  }
}

/** A stored choice wins; without one the system setting decides. */
export const resolveTheme = (stored: Theme | null, systemDark: boolean): Theme => stored ?? (systemDark ? 'dark' : 'light')
