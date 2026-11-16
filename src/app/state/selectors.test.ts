import { describe, it, expect } from 'vitest'
import { activeRequirement, horizonEnd, selectBaseBuilding, selectBuildings } from './selectors'
import { selectBuilding } from './selectBuilding'
import { initState } from './init'
import type { AppState } from './types'
import { building } from '../../domain/testing/fixtures'
import { BUNDLED_BUILDINGS } from '../../data'

const base: AppState = initState('', null, '2026-11-15')

describe('selectors', () => {
  it('selectBuildings lists bundled then imported buildings', () => {
    const imported = building({ id: 'csv-x' })
    expect(selectBuildings({ ...base, importedBuildings: [imported] }).map((b) => b.id)).toEqual(['odt', 'pbp', 'bsp', 'mgc', 'fex', 'csv-x'])
  })

  it('selectBaseBuilding finds by id and falls back to the first bundled building', () => {
    const imported = building({ id: 'csv-x' })
    expect(selectBaseBuilding({ ...base, buildingId: 'csv-x', importedBuildings: [imported] })).toBe(imported)
    expect(selectBaseBuilding({ ...base, buildingId: 'nope' })).toBe(BUNDLED_BUILDINGS[0])
  })

  it('selectBuilding returns the base building', () => {
    expect(selectBuilding(base)).toBe(BUNDLED_BUILDINGS[0])
  })

  it('activeRequirement is null without a minimum size', () => {
    expect(activeRequirement(base)).toBeNull()
  })

  it('activeRequirement maps nulls to absent fields', () => {
    expect(activeRequirement({ ...base, req: { minSf: 10000, maxSf: null, maxRentPsf: 60, includePotential: false } }))
      .toEqual({ minSf: 10000, maxRentPsf: 60, includePotential: false })
  })

  it('horizonEnd is slider step 60', () => {
    expect(horizonEnd(base)).toBe('2031-11-01')
  })
})
