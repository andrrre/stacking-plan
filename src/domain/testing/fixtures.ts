import { addDaysIso, addMonthsIso } from '../dates'
import type { Building, Floor, Lease, Suite } from '../types'

// Test builders. Defaults are valid against the shared schemas; overrides replace fields wholesale.

/** Default term: five years from `start` (end = start + 60 months − 1 day). */
export function lease(overrides: Partial<Lease> = {}): Lease {
  const tenant = overrides.tenant ?? 'Test Tenant'
  const start = overrides.start ?? '2020-01-01'
  const end = overrides.end !== undefined ? overrides.end : addDaysIso(addMonthsIso(start, 60), -1)
  return {
    id: `l-${tenant}-${start}-${end ?? 'open'}`,
    tenant,
    start,
    end,
    rentPsf: 40,
    ...overrides,
  }
}

export function suite(overrides: Partial<Suite> = {}): Suite {
  const number = overrides.number ?? '100'
  return {
    id: `s-${number}`,
    number,
    areaSf: 1000,
    kind: 'leasable',
    askingRentPsf: 40,
    joinsNext: false,
    leases: [],
    ...overrides,
  }
}

export function floor(overrides: Partial<Floor> = {}): Floor {
  const number = overrides.number ?? 1
  return {
    number,
    suites: [suite({ id: `s-f${number}-1`, number: `${number}00` })],
    ...overrides,
  }
}

export function building(overrides: Partial<Building> = {}): Building {
  return {
    id: 'test',
    name: 'Test Building',
    address: '1 Test Street',
    floors: [floor()],
    ...overrides,
  }
}
