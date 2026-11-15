import { it, expect } from 'vitest'
import { z } from 'zod'
import './zodConfig'

it('turns on jitless mode, and schemas built afterwards still validate', async () => {
  expect(z.config().jitless).toBe(true)
  const { BuildingSchema } = await import('./shared/domain.schema')
  const { BUNDLED_BUILDINGS } = await import('./data')
  for (const b of BUNDLED_BUILDINGS) expect(BuildingSchema.safeParse(b).success).toBe(true)
  expect(BuildingSchema.safeParse({ ...BUNDLED_BUILDINGS[0], floors: [] }).success).toBe(false)
})
