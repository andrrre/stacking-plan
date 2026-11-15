import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { sliderDate } from '../../domain/dates'
import { HORIZON_MONTHS } from '../../domain/constants'
import { kpis } from '../../domain/kpis'
import { riskBucket } from '../../domain/status'

const TODAY = '2026-11-15'
const building = BUNDLED_BUILDINGS[0]
const suites = building.floors.flatMap((f) => f.suites)

describe('lease-risk buckets', () => {
  it('le6 and le12 together are exactly the expiring suites at every slider step', () => {
    for (let step = 0; step <= HORIZON_MONTHS; step += 1) {
      const D = sliderDate(TODAY, step)
      const risky = suites.filter((s) => ['le6', 'le12'].includes(riskBucket(s, D, TODAY))).map((s) => s.id)
      const expiring = kpis(building, D, TODAY, true).ids.expiring
      expect([...risky].sort(), `step ${step}`).toEqual([...expiring].sort())
    }
  })
})
