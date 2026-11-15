import { it, expect } from 'vitest'
import { ParsedQuerySchema } from './ask.schema'

it('accepts maxRentPsf in 1..1000 (A13)', () => {
  expect(ParsedQuerySchema.safeParse({ maxRentPsf: 1 }).success).toBe(true)
  expect(ParsedQuerySchema.safeParse({ maxRentPsf: 1000 }).success).toBe(true)
  expect(ParsedQuerySchema.safeParse({ maxRentPsf: 0.5 }).success).toBe(false)
  expect(ParsedQuerySchema.safeParse({ maxRentPsf: 1000.01 }).success).toBe(false)
})

it('rejects maxSf below minSf', () => {
  expect(ParsedQuerySchema.safeParse({ minSf: 10000, maxSf: 9000 }).success).toBe(false)
  expect(ParsedQuerySchema.safeParse({ minSf: 9000, maxSf: 11000 }).success).toBe(true)
})
