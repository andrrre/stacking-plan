import { describe, expect, it } from 'vitest'
import { FLIGHT_OUT, flightAt } from './moveFlight'

const from = { x: 4, y: 5, z: 0, w: 2, h: 0.87, d: 8.2 }
const to = { x: -3, y: 4, z: 0, w: 3.5, h: 0.87, d: 8.2 }

describe('flightAt', () => {
  it('starts as the source box and ends as the destination box', () => {
    expect(flightAt(from, to, 0)).toEqual(from)
    expect(flightAt(from, to, 1)).toEqual(to)
  })
  it('is clear of the facade for the whole crossing', () => {
    for (const k of [0.25, 0.5, 0.75]) expect(flightAt(from, to, k).z).toBeCloseTo(FLIGHT_OUT)
  })
  it('does not move sideways or change size before it is clear, nor after it is back in line', () => {
    expect(flightAt(from, to, 0.2)).toMatchObject({ x: 4, y: 5, w: 2 })
    expect(flightAt(from, to, 0.8)).toMatchObject({ x: -3, y: 4, w: 3.5 })
  })
  it('is half-way across at the mid-point', () => {
    expect(flightAt(from, to, 0.5)).toMatchObject({ x: 0.5, y: 4.5, w: 2.75 })
  })
  it('clamps k outside [0, 1]', () => {
    expect(flightAt(from, to, -1)).toEqual(from)
    expect(flightAt(from, to, 2)).toEqual(to)
  })
})
