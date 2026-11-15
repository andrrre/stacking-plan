import { it, expect } from 'vitest'
import { building, floor, lease, suite } from './fixtures'
import { BuildingSchema } from '../../shared/domain.schema'

it('lease() defaults to a five-year term from its start', () => {
  expect(lease()).toMatchObject({ start: '2020-01-01', end: '2024-12-31' })
  expect(lease({ start: '2032-03-01' })).toMatchObject({ start: '2032-03-01', end: '2037-02-28' })
  expect(lease({ end: null }).end).toBeNull()
})

it('lease() default ids differ when the dates differ', () => {
  expect(lease({ end: '2027-01-01' }).id).not.toBe(lease({ end: '2028-01-01' }).id)
})

it('floor() default suite ids are unique across floors', () => {
  const ids = [floor({ number: 1 }), floor({ number: 10 }), floor({ number: 2 })].flatMap((f) => f.suites.map((s) => s.id))
  expect(new Set(ids).size).toBe(3)
})

it('the default building is schema-valid', () => {
  const b = building({ floors: [floor(), floor({ number: 2, suites: [suite({ number: '200', leases: [lease()] })] })] })
  expect(BuildingSchema.safeParse(b).success).toBe(true)
})
