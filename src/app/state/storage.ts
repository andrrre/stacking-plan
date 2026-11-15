import { z } from 'zod'
import { BuildingSchema, ShortlistEntrySchema } from '../../shared/domain.schema'
import { MAX_SHORTLIST } from '../../domain/constants'
import { BUNDLED_BUILDINGS } from '../../data'
import type { Building, ShortlistEntry } from '../../domain/types'

export const SHORTLIST_KEY = 'stackmatch.v1.shortlist'
export const IMPORTED_KEY = 'stackmatch.v1.imported'

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const ShortlistArray = z.array(ShortlistEntrySchema)
const BuildingArray = z.array(BuildingSchema)

/** window.localStorage, or null where reading it throws (private mode, blocked site data) or it does not exist. */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Any failure (missing, bad JSON, schema-invalid, throwing storage) returns []. */
function load<T>(storage: StorageLike | null, key: string, schema: z.ZodType<T[]>): T[] {
  try {
    const raw = storage?.getItem(key)
    if (raw === null || raw === undefined) return []
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

/** A failed save (quota, private mode) is silent: persistence is a convenience. */
function save(storage: StorageLike | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value))
  } catch {
    // ignored by design (spec-technical §3.6)
  }
}

/** Valid entries only, first occurrence of each id, capped at MAX_SHORTLIST per building (the reducer's invariants). */
export function loadShortlist(storage: StorageLike | null): ShortlistEntry[] {
  const entries = load(storage, SHORTLIST_KEY, ShortlistArray)
  const seen = new Map<string, number>()
  return entries.filter((e, i) => {
    if (entries.findIndex((x) => x.id === e.id) !== i) return false
    const n = (seen.get(e.buildingId) ?? 0) + 1
    seen.set(e.buildingId, n)
    return n <= MAX_SHORTLIST
  })
}

export function saveShortlist(storage: StorageLike | null, entries: readonly ShortlistEntry[]): void {
  save(storage, SHORTLIST_KEY, entries)
}

/** Valid buildings only; an id that collides with a bundled building is dropped. */
export function loadImported(storage: StorageLike | null): Building[] {
  const bundledIds = new Set(BUNDLED_BUILDINGS.map((b) => b.id))
  return load(storage, IMPORTED_KEY, BuildingArray).filter((b) => !bundledIds.has(b.id))
}

export function saveImported(storage: StorageLike | null, buildings: readonly Building[]): void {
  save(storage, IMPORTED_KEY, buildings)
}
