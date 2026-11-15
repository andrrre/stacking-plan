import { describe, it, expect } from 'vitest'
import { IDLE, captureLost, pointerCancel, pointerDown, pointerUp, type PointerInput } from './gesture'

const mouse = (id: number, x: number, y: number, button = 0): PointerInput => ({ id, x, y, button, pointerType: 'mouse', isPrimary: true })
const touch = (id: number, x: number, y: number, isPrimary = true): PointerInput => ({ id, x, y, button: 0, pointerType: 'touch', isPrimary })

describe('click versus gesture', () => {
  it('a press and release in place is a click', () => {
    expect(pointerUp(pointerDown(IDLE, mouse(1, 10, 10)), mouse(1, 12, 11)).click).toBe(true)
  })

  it('a mouse that moved more than 4 px was an orbit, not a click', () => {
    expect(pointerUp(pointerDown(IDLE, mouse(1, 10, 10)), mouse(1, 16, 10)).click).toBe(false)
  })

  it('a finger gets 10 px of slop', () => {
    expect(pointerUp(pointerDown(IDLE, touch(1, 10, 10)), touch(1, 18, 14)).click).toBe(true)
    expect(pointerUp(pointerDown(IDLE, touch(1, 10, 10)), touch(1, 22, 10)).click).toBe(false)
  })

  it('a pinch never ends as a click, whichever finger lifts first, even back in place', () => {
    const two = pointerDown(pointerDown(IDLE, touch(1, 10, 10)), touch(2, 100, 100, false))
    const first = pointerUp(two, touch(2, 100, 100))
    expect(first.click).toBe(false)
    const last = pointerUp(first.state, touch(1, 10, 10))
    expect(last.click).toBe(false)
    expect(last.state).toEqual(IDLE)
    // and the next plain tap is a click again
    expect(pointerUp(pointerDown(last.state, touch(3, 5, 5)), touch(3, 5, 5)).click).toBe(true)
  })

  it('a cancelled pointer is no click and leaves no stale state', () => {
    const cancelled = pointerCancel(pointerDown(IDLE, touch(1, 10, 10)), 1)
    expect(cancelled).toEqual(IDLE)
    expect(pointerUp(cancelled, touch(1, 10, 10)).click).toBe(false)
  })

  it('only the primary button clicks, and an up without a down does nothing', () => {
    expect(pointerUp(pointerDown(IDLE, mouse(1, 10, 10, 2)), mouse(1, 10, 10, 2)).click).toBe(false)
    expect(pointerUp(IDLE, mouse(7, 0, 0))).toEqual({ state: IDLE, click: false })
  })

  it('never mutates the state it is given', () => {
    const s = pointerDown(IDLE, mouse(1, 0, 0))
    const copy = { ...s, active: [...s.active] }
    pointerDown(s, mouse(2, 5, 5))
    pointerUp(s, mouse(1, 0, 0))
    expect({ ...s, active: [...s.active] }).toEqual(copy)
  })
  it('a pointer that never reported its release does not block later clicks: a new primary press starts afresh', () => {
    const stale = pointerDown(IDLE, mouse(1, 10, 10)) // its pointerup never arrived
    const next = pointerDown(stale, mouse(2, 50, 50))
    expect(next.multi).toBe(false)
    expect(pointerUp(next, mouse(2, 50, 50)).click).toBe(true)
  })

  it('a second finger (not primary) still makes a pinch', () => {
    const pinch = pointerDown(pointerDown(IDLE, touch(1, 10, 10)), touch(2, 60, 60, false))
    expect(pinch.multi).toBe(true)
  })

  it('a lost pointer capture resets the gesture', () => {
    const stuck = pointerDown(pointerDown(IDLE, touch(1, 10, 10)), touch(2, 60, 60, false))
    expect(captureLost()).toEqual(IDLE)
    expect(pointerUp(pointerDown(captureLost(), touch(3, 5, 5)), touch(3, 5, 5)).click).toBe(true)
    expect(stuck.active).toHaveLength(2)
  })
})
