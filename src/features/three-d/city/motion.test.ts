import { describe, expect, it } from 'vitest'
import { CITY_KEY, FRAME_MS, MAX_STEP_MS, cityDim, cityMotionRuns, coveredByModal, loadCity, motionHeld, nextTick, onScreenEnough, saveCity } from './motion'

const ALL_ON = { city: true, reduced: false, held: false, visible: true, onScreen: true, covered: false, printing: false }

describe('cityMotionRuns', () => {
  it('runs only with the city on, motion allowed, the page visible, the canvas on screen and not printing', () => {
    expect(cityMotionRuns(ALL_ON)).toBe(true)
    expect(cityMotionRuns({ ...ALL_ON, city: false })).toBe(false)
    expect(cityMotionRuns({ ...ALL_ON, reduced: true })).toBe(false)
    expect(cityMotionRuns({ ...ALL_ON, visible: false })).toBe(false)
    expect(cityMotionRuns({ ...ALL_ON, onScreen: false })).toBe(false)
    expect(cityMotionRuns({ ...ALL_ON, printing: true })).toBe(false)
    expect(cityMotionRuns({ ...ALL_ON, held: true })).toBe(false)
    expect(cityMotionRuns({ ...ALL_ON, covered: true })).toBe(false)
  })
})

describe('onScreenEnough', () => {
  it('counts the scene as on screen only when at least a quarter of it shows', () => {
    expect(onScreenEnough(1)).toBe(true)
    expect(onScreenEnough(0.25)).toBe(true)
    expect(onScreenEnough(0.24)).toBe(false)
    expect(onScreenEnough(0)).toBe(false)
  })
})

describe('coveredByModal', () => {
  const page = (html: string) => {
    document.body.innerHTML = html
    const el = document.querySelector('#scene')
    if (!el) throw new Error('no scene')
    return el
  }

  it('is false with no modal open', () => {
    expect(coveredByModal(page('<div data-print="shell"><div id="scene"></div></div><dialog></dialog>'))).toBe(false)
  })

  it('is true inside an inert shell (DialogFrame) and while any <dialog> is open (showModal)', () => {
    expect(coveredByModal(page('<div data-print="shell" inert><div id="scene"></div></div>'))).toBe(true)
    expect(coveredByModal(page('<div><div id="scene"></div></div><dialog open></dialog>'))).toBe(true)
  })

  it('a detached scene is not covered', () => {
    expect(coveredByModal(document.createElement('div'))).toBe(false)
  })
})

describe('cityDim', () => {
  it('is 1 for the whole building, 0.4 in floor view, and fades to 0.5 as the floors separate', () => {
    expect(cityDim(null, 0)).toBe(1)
    expect(cityDim(null, 1)).toBe(0.5)
    expect(cityDim(null, 0.5)).toBe(0.75)
    expect(cityDim(5, 0)).toBe(0.4)
    expect(cityDim(5, 1)).toBe(0.4)
  })
})

describe('motionHeld', () => {
  it('?cityMotion=off holds the traffic still (tests, recording); anything else leaves it alone', () => {
    expect(motionHeld('?today=2026-11-15&cityMotion=off')).toBe(true)
    expect(motionHeld('?cityMotion=on')).toBe(false)
    expect(motionHeld('?cityMotion=OFF')).toBe(false)
    expect(motionHeld('?cityMotion=')).toBe(false)
    expect(motionHeld('')).toBe(false)
  })
})

describe('nextTick', () => {
  it('waits for a frame interval (≈30 fps) and then advances the clock by the time that passed', () => {
    const start = { at: 1000, elapsed: 5 }
    expect(nextTick(start, 1000 + FRAME_MS / 2)).toBeNull()
    const t = nextTick(start, 1000 + FRAME_MS)
    expect(t).toEqual({ at: 1000 + FRAME_MS, elapsed: 5 + FRAME_MS / 1000 })
  })

  it('a long pause (a hidden tab, a slow frame) moves the clock by at most MAX_STEP_MS', () => {
    expect(nextTick({ at: 0, elapsed: 0 }, 60_000)).toEqual({ at: 60_000, elapsed: MAX_STEP_MS / 1000 })
  })

  it('a clock going backwards does not move the city backwards', () => {
    expect(nextTick({ at: 500, elapsed: 2 }, 100)).toBeNull()
  })
})

describe('city preference', () => {
  const store = (raw: string | null) => {
    const saved: string[] = []
    return { saved, s: { getItem: () => raw, setItem: (_k: string, v: string) => { saved.push(v) } } }
  }

  it('defaults to on when nothing (or nothing valid) is stored', () => {
    expect(loadCity(null)).toBe(true)
    expect(loadCity(store(null).s)).toBe(true)
    expect(loadCity(store('not json').s)).toBe(true)
    expect(loadCity(store('"off"').s)).toBe(true)
    expect(loadCity(store('0').s)).toBe(true)
  })

  it('reads a stored boolean', () => {
    expect(loadCity(store('false').s)).toBe(false)
    expect(loadCity(store('true').s)).toBe(true)
  })

  it('a throwing storage reads as the default and saving to it is silent', () => {
    const bad = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') } }
    expect(loadCity(bad)).toBe(true)
    expect(() => saveCity(bad, false)).not.toThrow()
  })

  it('saves under its own versioned key', () => {
    const keys: string[] = []
    saveCity({ getItem: () => null, setItem: (k, v) => { keys.push(`${k}=${v}`) } }, false)
    expect(CITY_KEY).toBe('stackmatch.v1.city')
    expect(keys).toEqual(['stackmatch.v1.city=false'])
  })
})
