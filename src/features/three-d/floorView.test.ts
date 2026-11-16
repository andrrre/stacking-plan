import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { findFits } from '../../domain/findFits'
import { buildStackModel, type StackModel } from '../stack/suiteVisual'
import { floorCaption, floorMarks, floorValueText, initialFloor, isVacant, wheelPixels, wheelStep, WHEEL_LINE, WHEEL_NOTCH } from './floorView'

const TODAY = '2026-11-15'
const [ODT] = BUNDLED_BUILDINGS

function model(minSf: number | null = null, asOf = TODAY): StackModel {
  const matches = minSf === null ? [] : findFits(ODT, { minSf, includePotential: true }, asOf, TODAY)
  return buildStackModel({
    building: ODT, asOf, today: TODAY, mode: 'availability', matches, highlightIds: null, modifiedIds: new Set(), selectedSuiteId: null,
  })
}

const floorOf = (m: StackModel, n: number) => {
  const f = m.floors.find((x) => x.number === n)
  if (!f) throw new Error(`floor ${n}`)
  return f
}

describe('isVacant', () => {
  it('counts vacant and potential space, not space already committed to a new lease', () => {
    const m = model()
    const vacant = m.floors.flatMap((f) => f.suites).filter(isVacant).map((v) => v.suite.number).sort()
    expect(vacant).toEqual(['300', '310', '410', '500', '700', '710'])
  })
})

describe('initialFloor', () => {
  it('opens on the highest floor with a vacant suite (1010 is committed, so floor 7)', () => {
    expect(initialFloor(model(), null)).toBe(7)
  })

  it('opens on the selected suite\'s floor', () => {
    expect(initialFloor(model(), 'odt-220')).toBe(2)
  })

  it('ignores a selection that is not in the building', () => {
    expect(initialFloor(model(), 'nope')).toBe(7)
  })

  it('falls back to the top floor when nothing is vacant, and to null for an empty building', () => {
    const m = model()
    const full: StackModel = { floors: m.floors.map((f) => ({ ...f, suites: f.suites.filter((v) => !isVacant(v)) })) }
    expect(initialFloor(full, null)).toBe(12)
    expect(initialFloor({ floors: [] }, null)).toBeNull()
  })
})

describe('floorMarks', () => {
  it('lists every floor top first, marking vacancy and search matches', () => {
    const marks = floorMarks(model(10000))
    expect(marks.map((k) => k.floor)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
    expect(marks.filter((k) => k.vacant).map((k) => k.floor)).toEqual([7, 5, 4, 3])
    expect(marks.filter((k) => k.match).map((k) => k.floor)).toEqual([7, 5])
  })

  it('marks no matches without a search', () => {
    expect(floorMarks(model()).some((k) => k.match)).toBe(false)
  })

  it('is empty for an empty building', () => {
    expect(floorMarks({ floors: [] })).toEqual([])
  })
})

describe('floorValueText', () => {
  it('names the floor and its place from the bottom among all floors', () => {
    const marks = floorMarks(model())
    expect(floorValueText(marks, 7)).toBe('Floor 7, 7 of 12')
    expect(floorValueText(marks, 12)).toBe('Floor 12, 12 of 12')
    expect(floorValueText(marks, 1)).toBe('Floor 1, 1 of 12')
  })

  it('counts places, not floor numbers, when the numbering skips or starts below 1', () => {
    const marks = [{ floor: 20, vacant: false, match: false }, { floor: 3, vacant: false, match: false }, { floor: 0, vacant: false, match: false }]
    expect(floorValueText(marks, 20)).toBe('Floor 20, 3 of 3')
    expect(floorValueText(marks, 0)).toBe('Floor 0, 1 of 3')
  })
})

describe('floorCaption', () => {
  it('gives the floor, its plate and its vacant space', () => {
    const m = model()
    const f = floorOf(m, 5)
    expect(floorCaption(f)).toBe(`Floor 5 · ${f.plateSf.toLocaleString('en-US')} SF · 10,250 SF vacant`)
  })

  it('says when a floor has no vacancy', () => {
    const f = floorOf(model(), 12)
    expect(floorCaption(f)).toBe(`Floor 12 · ${f.plateSf.toLocaleString('en-US')} SF · no vacancy`)
  })
})

describe('wheelStep', () => {
  it('a mouse notch steps one floor: up the wheel is up the building', () => {
    expect(wheelStep(0, -WHEEL_NOTCH)).toEqual({ acc: 0, step: 1 })
    expect(wheelStep(0, WHEEL_NOTCH)).toEqual({ acc: 0, step: -1 })
  })

  it('a trackpad\'s small deltas add up to a notch\'s worth before stepping, and a big delta steps only once', () => {
    let acc = 0
    const steps: number[] = []
    for (let i = 0; i < 8; i++) {
      const r = wheelStep(acc, 12)
      acc = r.acc
      steps.push(r.step)
    }
    expect(steps.filter((s) => s !== 0)).toEqual([-1])
    expect(wheelStep(0, 900)).toEqual({ acc: 0, step: -1 })
  })

  it('a change of direction starts again from zero', () => {
    expect(wheelStep(30, -10)).toEqual({ acc: -10, step: 0 })
    expect(wheelStep(0, 0)).toEqual({ acc: 0, step: 0 })
  })
})

describe('wheelPixels', () => {
  it('passes pixel deltas through, and scales line and page deltas to pixels', () => {
    expect(wheelPixels(-120, 0, 500)).toBe(-120)
    expect(wheelPixels(3, 1, 500)).toBe(3 * WHEEL_LINE)
    expect(wheelPixels(-1, 2, 500)).toBe(-500)
  })

  it('one line or one page is enough for a floor step', () => {
    expect(wheelStep(0, wheelPixels(-3, 1, 500)).step).toBe(1)
    expect(wheelStep(0, wheelPixels(1, 2, 500)).step).toBe(-1)
  })
})
