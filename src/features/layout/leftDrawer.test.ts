import { describe, it, expect } from 'vitest'
import type { StorageLike } from '../../app/state/storage'
import { LEFT_DRAWER_KEY, loadLeftDrawer, saveLeftDrawer } from './leftDrawer'

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) } }
}

const throwing: StorageLike = {
  getItem: () => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('QuotaExceededError') },
}

describe('left drawer storage', () => {
  it('has no setting when nothing is stored, there is no storage, or storage throws', () => {
    expect(loadLeftDrawer(memoryStorage())).toBeNull()
    expect(loadLeftDrawer(null)).toBeNull()
    expect(loadLeftDrawer(throwing)).toBeNull()
  })
  it('has no setting for bad JSON or a value of the wrong type', () => {
    expect(loadLeftDrawer(memoryStorage({ [LEFT_DRAWER_KEY]: '{nope' }))).toBeNull()
    expect(loadLeftDrawer(memoryStorage({ [LEFT_DRAWER_KEY]: '"closed"' }))).toBeNull()
    expect(loadLeftDrawer(memoryStorage({ [LEFT_DRAWER_KEY]: '0' }))).toBeNull()
  })
  it('round-trips open and closed under stackmatch.v1.leftDrawer', () => {
    const storage = memoryStorage()
    saveLeftDrawer(storage, false)
    expect(storage.data.get('stackmatch.v1.leftDrawer')).toBe('false')
    expect(loadLeftDrawer(storage)).toBe(false)
    saveLeftDrawer(storage, true)
    expect(loadLeftDrawer(storage)).toBe(true)
  })
  it('a failed save is silent', () => {
    expect(() => saveLeftDrawer(throwing, false)).not.toThrow()
    expect(() => saveLeftDrawer(null, false)).not.toThrow()
  })
})
