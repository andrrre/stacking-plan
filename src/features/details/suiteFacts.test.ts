import { describe, it, expect } from 'vitest'
import { building, floor, suite } from '../../domain/testing/fixtures'
import { locate, monthsText } from './suiteFacts'

const b = building({
  floors: [floor({
    number: 1,
    suites: [
      suite({ id: 'a', number: '100', joinsNext: true }),
      suite({ id: 'c', number: '110', kind: 'common', joinsNext: true }),
      suite({ id: 'd', number: '120' }),
    ],
  })],
})

describe('suiteFacts', () => {
  it('a leasable suite does not list a common neighbour', () => {
    expect(locate(b, 'a')?.neighbours).toEqual([])
  })

  it('a leasable suite does not list a common neighbour on its left either', () => {
    expect(locate(b, 'd')?.neighbours).toEqual([])
  })

  it('a common suite has no combine neighbours', () => {
    expect(locate(b, 'c')?.neighbours).toEqual([])
  })

  it('monthsText', () => {
    expect(monthsText(0)).toBe('< 1 month')
    expect(monthsText(1)).toBe('1 month')
    expect(monthsText(5)).toBe('5 months')
  })
})
