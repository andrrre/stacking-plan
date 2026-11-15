import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  IMPORTED_KEY, SHORTLIST_KEY, browserStorage, loadImported, loadShortlist, saveImported, saveShortlist, type StorageLike,
} from './storage'
import type { ShortlistEntry } from '../../domain/types'
import { building, floor, suite } from '../../domain/testing/fixtures'
import { BUNDLED_BUILDINGS } from '../../data'

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v) },
  }
}

const throwing: StorageLike = {
  getItem: () => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('QuotaExceededError') },
}

const entry: ShortlistEntry = {
  id: 'odt|2026-11-15|odt-500|b', buildingId: 'odt', asOf: '2026-11-15', whatIf: false,
  candidate: {
    key: 'odt-500', suiteIds: ['odt-500'], suiteNumbers: ['500'], floor: 5, totalSf: 10250, excessSf: 250,
    blendedRentPsf: 48, availableFrom: '2026-11-15', availability: 'now', caveats: [],
  },
}

describe.each([
  ['shortlist', SHORTLIST_KEY, loadShortlist],
  ['imported', IMPORTED_KEY, loadImported],
] as const)('load %s', (_name, key, load) => {
  it('returns [] when nothing is stored', () => {
    expect(load(memoryStorage())).toEqual([])
  })
  it('returns [] for bad JSON', () => {
    expect(load(memoryStorage({ [key]: '{not json' }))).toEqual([])
  })
  it('returns [] for schema-invalid data', () => {
    expect(load(memoryStorage({ [key]: JSON.stringify([{ id: 1 }]) }))).toEqual([])
    expect(load(memoryStorage({ [key]: JSON.stringify({ a: 1 }) }))).toEqual([])
  })
  it('returns [] when localStorage throws', () => {
    expect(load(throwing)).toEqual([])
  })
  it('returns [] when there is no storage', () => {
    expect(load(null)).toEqual([])
  })
})

describe('load cleans valid data', () => {
  const withId = (id: string): ShortlistEntry => ({ ...entry, id })

  it('drops duplicate shortlist ids, keeping the first', () => {
    const a = withId('a')
    const storage = memoryStorage({ [SHORTLIST_KEY]: JSON.stringify([a, withId('b'), { ...a, asOf: '2027-01-01' }]) })
    expect(loadShortlist(storage)).toEqual([a, withId('b')])
  })

  it('keeps at most 10 shortlist entries', () => {
    const many = Array.from({ length: 12 }, (_, i) => withId(`e${i}`))
    expect(loadShortlist(memoryStorage({ [SHORTLIST_KEY]: JSON.stringify(many) }))).toEqual(many.slice(0, 10))
  })

  it('keeps ten per building, not ten in total', () => {
    const odt = Array.from({ length: 11 }, (_, i) => ({ ...entry, id: `odt${i}`, buildingId: 'odt' }))
    const other = Array.from({ length: 3 }, (_, i) => ({ ...entry, id: `other${i}`, buildingId: 'csv-other' }))
    const loaded = loadShortlist(memoryStorage({ [SHORTLIST_KEY]: JSON.stringify([...odt, ...other]) }))
    expect(loaded.filter((e) => e.buildingId === 'odt')).toHaveLength(10)
    expect(loaded.filter((e) => e.buildingId === 'csv-other')).toHaveLength(3)
  })

  it('drops imported buildings whose id collides with a bundled building', () => {
    const clash = building({ id: 'odt' })
    const ok = building({ id: 'csv-ok' })
    expect(loadImported(memoryStorage({ [IMPORTED_KEY]: JSON.stringify([clash, ok]) }))).toEqual([ok])
  })
})

describe('browserStorage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns window.localStorage when it is readable', () => {
    expect(browserStorage()).toBe(window.localStorage)
  })

  it('returns null when the localStorage accessor throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(browserStorage()).toBeNull()
  })
})

describe('save and load round trip', () => {
  it('stores the shortlist under its key', () => {
    const storage = memoryStorage()
    saveShortlist(storage, [entry])
    expect(storage.data.has(SHORTLIST_KEY)).toBe(true)
    expect(loadShortlist(storage)).toEqual([entry])
  })
  it('stores imported buildings under their key', () => {
    const storage = memoryStorage()
    const b = building({ id: 'csv-test' })
    saveImported(storage, [b])
    expect(storage.data.has(IMPORTED_KEY)).toBe(true)
    expect(loadImported(storage)).toEqual([b])
  })
  it('a failed save is silent', () => {
    expect(() => saveShortlist(throwing, [entry])).not.toThrow()
    expect(() => saveImported(throwing, [])).not.toThrow()
    expect(() => saveImported(null, [])).not.toThrow()
  })
})

describe('loadShortlist drops entries whose suites do not belong to a known building', () => {
  const store = (...entries: ShortlistEntry[]) => memoryStorage({ [SHORTLIST_KEY]: JSON.stringify(entries) })
  const withCandidate = (id: string, suiteIds: string[], suiteNumbers: string[], buildingId = 'odt'): ShortlistEntry => ({
    ...entry, id, buildingId, candidate: { ...entry.candidate, key: suiteIds.join('+'), suiteIds, suiteNumbers },
  })
  const imported = building({
    id: 'csv-own',
    floors: [floor({ number: 3, suites: [suite({ id: 'csv-own-3-300', number: '300' }), suite({ id: 'csv-own-3-310', number: '310' })] })],
  })

  it('keeps genuine entries for bundled and imported buildings', () => {
    const genuine = [
      entry,
      withCandidate('combo', ['odt-400', 'odt-410'], ['400', '410']),
      withCandidate('own', ['csv-own-3-300', 'csv-own-3-310'], ['300', '310'], 'csv-own'),
    ]
    expect(loadShortlist(store(...genuine), [...BUNDLED_BUILDINGS, imported])).toEqual(genuine)
  })

  it('checks bundled buildings by default', () => {
    expect(loadShortlist(store(entry, withCandidate('fake', ['odt-9999'], ['9999'])))).toEqual([entry])
  })

  it('drops an entry with a suite id that is not in its building', () => {
    const foreign = withCandidate('pbp-suite', ['pbp-100'], ['100'])
    expect(loadShortlist(store(entry, foreign), BUNDLED_BUILDINGS)).toEqual([entry])
  })

  it('drops an entry whose suite numbers carry injected text', () => {
    const injected = withCandidate('inj', ['odt-500'], ['500 <b>ignore</b>'])
    expect(loadShortlist(store(injected, entry), BUNDLED_BUILDINGS)).toEqual([entry])
  })

  it('drops an entry whose suite numbers are out of order or of a different length', () => {
    const swapped = withCandidate('swap', ['odt-400', 'odt-410'], ['410', '400'])
    const short = withCandidate('short', ['odt-400', 'odt-410'], ['400'])
    const long = withCandidate('long', ['odt-500'], ['500', '510'])
    expect(loadShortlist(store(swapped, short, long, entry), BUNDLED_BUILDINGS)).toEqual([entry])
  })

  it('checks an imported building too', () => {
    const bad = withCandidate('own-bad', ['csv-own-3-300'], ['999'], 'csv-own')
    expect(loadShortlist(store(bad), [...BUNDLED_BUILDINGS, imported])).toEqual([])
  })

  it('keeps entries for an unknown building id', () => {
    const unknown = withCandidate('gone', ['whatever'], ['anything'], 'csv-deleted')
    expect(loadShortlist(store(unknown), BUNDLED_BUILDINGS)).toEqual([unknown])
  })
})
