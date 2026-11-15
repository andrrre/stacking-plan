import { describe, it, expect } from 'vitest'
import { caveatText } from './caveats'

// Strings: spec-technical §3.3 (wording also in spec.md A11).
describe('caveatText', () => {
  it('combine reads the same for both audiences', () => {
    expect(caveatText({ kind: 'combine', count: 2 }, 'broker')).toBe('Requires combining 2 suites.')
    expect(caveatText({ kind: 'combine', count: 3 }, 'client')).toBe('Requires combining 3 suites.')
  })

  it('assumesNoRenewal names the tenant for the broker only', () => {
    const c = { kind: 'assumesNoRenewal', tenant: 'Flamingo Row Media', leaseEnd: '2027-04-30' } as const
    expect(caveatText(c, 'broker')).toBe('Assumes Flamingo Row Media does not renew (lease ends 30 Apr 2027).')
    expect(caveatText(c, 'client')).toBe('Subject to the current tenant vacating (30 Apr 2027).')
    expect(caveatText(c, 'client')).not.toContain('Flamingo')
  })
})
