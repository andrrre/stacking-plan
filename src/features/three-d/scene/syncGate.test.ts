import { describe, expect, it } from 'vitest'
import { syncNeeded, type SyncMark } from './syncGate'

const inputs = { layout: 'a' }
const other = { layout: 'b' }
const mark = (key: string, i: object | null): SyncMark => ({ key, inputs: i })

describe('syncNeeded', () => {
  it('the first frame always syncs', () => {
    expect(syncNeeded(mark('', null), 'cam1', inputs)).toBe(true)
  })

  it('the same view and the same inputs (a frame only the city asked for) do not sync, so the pending report is kept', () => {
    expect(syncNeeded(mark('cam1|hover:', inputs), 'cam1|hover:', inputs)).toBe(false)
  })

  it('new inputs with the camera still sync (a search, a date, a selection)', () => {
    expect(syncNeeded(mark('cam1|hover:', inputs), 'cam1|hover:', other)).toBe(true)
  })

  it('a camera move or a hover change syncs', () => {
    expect(syncNeeded(mark('cam1|hover:', inputs), 'cam2|hover:', inputs)).toBe(true)
    expect(syncNeeded(mark('cam1|hover:', inputs), 'cam1|hover:odt-500', inputs)).toBe(true)
  })
})
