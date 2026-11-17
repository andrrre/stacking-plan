import { formatLongDate } from './format.js'
import type { Caveat } from './types.js'

/** Plain-words caveat. The client audience never sees a tenant name (spec A11). */
export function caveatText(c: Caveat, audience: 'broker' | 'client'): string {
  if (c.kind === 'combine') return `Requires combining ${c.count} suites.`
  const end = formatLongDate(c.leaseEnd)
  return audience === 'broker'
    ? `Assumes ${c.tenant} does not renew (lease ends ${end}).`
    : `Subject to the current tenant vacating (${end}).`
}
