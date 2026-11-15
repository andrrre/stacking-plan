import { format, parseISO } from 'date-fns'
import type { ISODate } from './types'

const INTEGER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const PSF = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** "12,400" */
export function formatNumber(n: number): string {
  return INTEGER.format(n)
}

/** "38,150 SF" */
export function formatSf(sf: number): string {
  return `${formatNumber(sf)} SF`
}

/** "$52.18" */
export function formatPsf(psf: number): string {
  return PSF.format(psf)
}

/** "$4,913,650" */
export function formatMoney(amount: number): string {
  return MONEY.format(amount)
}

/** "May 2027" */
export function formatMonthYear(d: ISODate): string {
  return format(parseISO(d), 'MMM yyyy')
}

/** "04/2027" */
export function formatMmYyyy(d: ISODate): string {
  return format(parseISO(d), 'MM/yyyy')
}

/** "30 Apr 2027" */
export function formatLongDate(d: ISODate): string {
  return format(parseISO(d), 'd MMM yyyy')
}

/** "Suite 500", "Suites 700 + 710"; empty for no suites. */
export function suitesLabel(suiteNumbers: readonly string[]): string {
  if (suiteNumbers.length === 0) return ''
  return suiteNumbers.length === 1 ? `Suite ${suiteNumbers[0]}` : `Suites ${suiteNumbers.join(' + ')}`
}
