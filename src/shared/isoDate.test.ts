import { describe, it, expect } from 'vitest'
import { MAX_ISO_DATE, MIN_ISO_DATE, isoDate } from './isoDate'

describe('isoDate', () => {
  it('accepts real dates inside 1900-01-01..2200-12-31, edges included', () => {
    expect(MIN_ISO_DATE).toBe('1900-01-01')
    expect(MAX_ISO_DATE).toBe('2200-12-31')
    for (const d of ['1900-01-01', '2026-11-15', '2024-02-29', '2200-12-31']) expect(isoDate.safeParse(d).success).toBe(true)
  })

  it('rejects dates outside the range', () => {
    for (const d of ['1899-12-31', '2201-01-01', '9999-12-31', '0001-01-01']) expect(isoDate.safeParse(d).success).toBe(false)
  })

  it('still rejects non-dates', () => {
    for (const d of ['2026-02-30', '2026-1-1', '', 'today', null, 20261115]) expect(isoDate.safeParse(d).success).toBe(false)
  })

  it('keeps the bound when made nullable', () => {
    expect(isoDate.nullable().safeParse(null).success).toBe(true)
    expect(isoDate.nullable().safeParse('9999-12-31').success).toBe(false)
  })
})
