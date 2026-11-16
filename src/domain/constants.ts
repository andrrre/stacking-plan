/** A lease ending within this many months of D (inclusive) is expiring. */
export const EXPIRING_MONTHS = 12
/** The slider and the no-fit scan cover this many monthly steps after today. */
export const HORIZON_MONTHS = 60
/** findFits returns at most this many candidates. */
export const MAX_RESULTS = 5
/** makeRoom returns at most this many move options. */
export const MAX_MOVE_OPTIONS = 3
/** Lease-risk bucket edges in months (A3). */
export const RISK_EDGES = [6, 12, 24, 36] as const
/** The shortlist holds at most this many entries (A11). */
export const MAX_SHORTLIST = 10
export { MIN_REQ_SF, MAX_REQ_SF, MIN_RENT_PSF, MAX_RENT_PSF } from '../shared/limits'
