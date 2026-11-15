import { z } from 'zod'
import { isoDate } from '../../shared/isoDate'
import type { Change } from '../../domain/types'

// The change dialog's text fields, and their validation into a Change (zod validates all user input).

export type ChangeForm = { tenant: string; start: string; end: string; rent: string; date: string }
export type Parsed = { ok: true; change: Change } | { ok: false; message: string }

const rentText = (psf: number) => String(Math.round(psf * 100) / 100)

export function toForm(c: Change): ChangeForm {
  const empty = { tenant: '', start: '', end: '', rent: '', date: '' }
  switch (c.kind) {
    case 'renew': return { ...empty, date: c.newEnd }
    case 'vacate': return { ...empty, date: c.on }
    case 'newLease': return { ...empty, tenant: c.tenant, start: c.start, end: c.end, rent: rentText(c.rentPsf) }
  }
}

const realDate = (what: string) => z.string().refine((v) => isoDate.safeParse(v).success, `Enter a real ${what} date.`)

const NewLeaseFields = z.object({
  tenant: z.string().trim().min(1, 'Enter a tenant name.').max(80, 'The tenant name is at most 80 characters.'),
  start: realDate('start'),
  end: realDate('end'),
  rent: z.string().trim().regex(/^\d+(\.\d+)?$/, 'Enter the rent as a number, e.g. 48.50.').transform(Number),
}).refine((f) => f.end >= f.start, 'The end must not be before the start.')

const RENT_BOUNDS = 'The rent must be between $1 and $1,000 /SF/yr.'
/** Checked on the rent that goes into the change, so an untouched prefill is bounded too. */
const RentPsf = z.number().min(1, RENT_BOUNDS).max(1000, RENT_BOUNDS)

function firstIssue(e: z.ZodError): string {
  return e.issues[0]?.message ?? 'Check the values.'
}

/** Form → Change. An untouched rent keeps the prefilled value exactly (a blended rent is not rounded to cents). */
export function parseForm(initial: Change, f: ChangeForm): Parsed {
  if (initial.kind !== 'newLease') {
    const d = realDate(initial.kind === 'renew' ? 'end' : 'vacate').safeParse(f.date)
    if (!d.success) return { ok: false, message: firstIssue(d.error) }
    return initial.kind === 'renew'
      ? { ok: true, change: { ...initial, newEnd: d.data } }
      : { ok: true, change: { ...initial, on: d.data } }
  }
  const r = NewLeaseFields.safeParse(f)
  if (!r.success) return { ok: false, message: firstIssue(r.error) }
  const rent = RentPsf.safeParse(f.rent === rentText(initial.rentPsf) ? initial.rentPsf : r.data.rent)
  if (!rent.success) return { ok: false, message: firstIssue(rent.error) }
  return { ok: true, change: { ...initial, tenant: r.data.tenant, start: r.data.start, end: r.data.end, rentPsf: rent.data } }
}
