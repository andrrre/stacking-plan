import { describe, expect, it } from 'vitest'
import { Object3D } from 'three'
import { suiteHit } from './interaction'

const suite = (id: string, visible = true) => Object.assign(new Object3D(), { visible, userData: { suiteId: id } })

describe('suiteHit', () => {
  it('is the nearest hit suite', () => {
    expect(suiteHit([{ object: suite('a') }, { object: suite('b') }])).toBe('a')
  })

  it('passes over a hidden suite (the previewed move\'s destination while its block flies)', () => {
    expect(suiteHit([{ object: suite('a', false) }, { object: suite('b') }])).toBe('b')
    expect(suiteHit([{ object: suite('a', false) }])).toBeNull()
  })

  it('is null for no hit or an object that is not a suite', () => {
    expect(suiteHit([])).toBeNull()
    expect(suiteHit([{ object: new Object3D() }])).toBeNull()
  })
})
