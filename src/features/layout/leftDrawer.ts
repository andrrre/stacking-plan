import { z } from 'zod'
import type { StorageLike } from '../../app/state/storage'

// The left drawer's open/closed setting, saved in localStorage (a viewing preference, not in the URL).

export const LEFT_DRAWER_KEY = 'stackmatch.v1.leftDrawer'

const Stored = z.boolean()

/** The stored setting; null when nothing valid is stored (missing, malformed or unreadable): the caller decides. */
export function loadLeftDrawer(storage: StorageLike | null): boolean | null {
  try {
    const raw = storage?.getItem(LEFT_DRAWER_KEY)
    if (raw === null || raw === undefined) return null
    const parsed = Stored.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function saveLeftDrawer(storage: StorageLike | null, open: boolean): void {
  try {
    storage?.setItem(LEFT_DRAWER_KEY, JSON.stringify(open))
  } catch {
    // ignored by design, as for the other saved settings
  }
}
