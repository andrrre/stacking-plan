import { describe, it, expect } from 'vitest'
import { addDaysIso, addMonthsIso, maxIso, monthOffset, monthsBetweenIso, sliderDate, snapToSlider } from './dates'

const TODAY = '2026-11-15'

describe('sliderDate', () => {
  it('step 0 is today', () => {
    expect(sliderDate(TODAY, 0)).toBe('2026-11-15')
  })
  it('step n is the 1st of month(today)+n', () => {
    expect(sliderDate(TODAY, 1)).toBe('2026-12-01')
    expect(sliderDate(TODAY, 6)).toBe('2027-05-01')
    expect(sliderDate(TODAY, 60)).toBe('2031-11-01')
  })
})

describe('snapToSlider', () => {
  it('snaps a date between steps down to the latest step', () => {
    expect(snapToSlider('2027-06-30', TODAY)).toBe('2027-06-01')
  })
  it('keeps a date that is exactly a step', () => {
    expect(snapToSlider('2027-05-01', TODAY)).toBe('2027-05-01')
  })
  it('snaps a later date in the current month to today', () => {
    expect(snapToSlider('2026-11-30', TODAY)).toBe(TODAY)
  })
  it('snaps a date before today to today', () => {
    expect(snapToSlider('2026-11-14', TODAY)).toBe(TODAY)
    expect(snapToSlider('2020-01-01', TODAY)).toBe(TODAY)
  })
  it('clamps a date past the horizon to step 60', () => {
    expect(snapToSlider('2031-11-02', TODAY)).toBe('2031-11-01')
    expect(snapToSlider('2040-01-01', TODAY)).toBe('2031-11-01')
  })
})

describe('addMonthsIso / addDaysIso', () => {
  it('clamps to month end', () => {
    expect(addMonthsIso('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonthsIso('2027-11-15', 12)).toBe('2028-11-15')
  })
  it('adds days across month and year ends', () => {
    expect(addDaysIso('2027-04-30', 1)).toBe('2027-05-01')
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysIso('2027-01-01', -1)).toBe('2026-12-31')
  })
})

describe('monthOffset', () => {
  it('is the slider index of the snapped date', () => {
    expect(monthOffset(TODAY, TODAY)).toBe(0)
    expect(monthOffset('2026-11-30', TODAY)).toBe(0)
    expect(monthOffset('2026-12-01', TODAY)).toBe(1)
    expect(monthOffset('2027-05-01', TODAY)).toBe(6)
    expect(monthOffset('2027-06-30', TODAY)).toBe(7)
    expect(monthOffset('2031-11-01', TODAY)).toBe(60)
  })
  it('clamps to 0..60', () => {
    expect(monthOffset('2020-01-01', TODAY)).toBe(0)
    expect(monthOffset('2040-01-01', TODAY)).toBe(60)
  })
})

describe('slider steps on awkward todays', () => {
  it('today on the 31st: step 1 is the 1st of the next month', () => {
    expect(sliderDate('2027-01-31', 1)).toBe('2027-02-01')
    expect(sliderDate('2027-01-31', 2)).toBe('2027-03-01')
    expect(sliderDate('2027-01-31', 60)).toBe('2032-01-01')
  })
  it('today on 2028-02-29: step 1 is 2028-03-01 and step 12 is 2029-02-01', () => {
    expect(sliderDate('2028-02-29', 1)).toBe('2028-03-01')
    expect(sliderDate('2028-02-29', 12)).toBe('2029-02-01')
  })
  it('every step snaps to itself', () => {
    for (const t of ['2027-01-31', '2028-02-29', TODAY]) {
      for (const m of [0, 1, 2, 13, 37, 60]) expect(snapToSlider(sliderDate(t, m), t)).toBe(sliderDate(t, m))
    }
  })
})

describe('monthsBetweenIso', () => {
  it('counts whole months between two dates', () => {
    expect(monthsBetweenIso('2026-11-15', '2027-04-30')).toBe(5)
    expect(monthsBetweenIso('2026-11-15', '2027-05-15')).toBe(6)
    expect(monthsBetweenIso('2026-11-15', '2026-11-15')).toBe(0)
  })
})

describe('maxIso', () => {
  it('returns the latest date', () => {
    expect(maxIso('2027-01-01', '2028-01-01', '2026-11-15')).toBe('2028-01-01')
    expect(maxIso('2027-01-01')).toBe('2027-01-01')
  })
})

describe('date helpers at the edges of the accepted range (1900-01-01..2200-12-31)', () => {
  const MIN = '1900-01-01'
  const MAX = '2200-12-31'

  it('adding five years to the last accepted date gives a real date', () => {
    expect(addMonthsIso(MAX, 60)).toBe('2205-12-31')
    expect(sliderDate(MAX, 60)).toBe('2205-12-01')
    expect(addDaysIso(MAX, 1)).toBe('2201-01-01')
  })

  it('stepping back from the first accepted date gives a real date', () => {
    expect(addDaysIso(MIN, -1)).toBe('1899-12-31')
    expect(addMonthsIso(MIN, -1)).toBe('1899-12-01')
  })

  it('snap, offset and month counts work across the whole range', () => {
    expect(snapToSlider(MAX, MIN)).toBe(sliderDate(MIN, 60))
    expect(monthOffset(MAX, MIN)).toBe(60)
    expect(snapToSlider(MIN, MAX)).toBe(MAX)
    expect(monthOffset(MAX, MAX)).toBe(0)
    expect(monthsBetweenIso(MIN, MAX)).toBe(3611)
    expect(maxIso(MIN, MAX)).toBe(MAX)
  })
})
