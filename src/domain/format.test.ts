import { it, expect } from 'vitest'
import { formatLongDate, formatMmYyyy, formatMoney, formatMonthYear, formatNumber, formatPsf, formatSf, suitesLabel } from './format'

it('formats square feet with thousands separators', () => {
  expect(formatSf(38150)).toBe('38,150 SF')
  expect(formatSf(800)).toBe('800 SF')
})

it('formats a grouped integer without a unit', () => {
  expect(formatNumber(12400)).toBe('12,400')
  expect(formatNumber(3000)).toBe('3,000')
  expect(formatNumber(0)).toBe('0')
})

it('formats rent per square foot with two decimals', () => {
  expect(formatPsf(48)).toBe('$48.00')
  expect(formatPsf(52.18095)).toBe('$52.18')
})

it('formats money in whole dollars', () => {
  expect(formatMoney(4913650)).toBe('$4,913,650')
  expect(formatMoney(0)).toBe('$0')
})

it('formats dates', () => {
  expect(formatMonthYear('2027-05-01')).toBe('May 2027')
  expect(formatMmYyyy('2027-04-30')).toBe('04/2027')
  expect(formatLongDate('2027-04-30')).toBe('30 Apr 2027')
  expect(formatLongDate('2026-11-05')).toBe('5 Nov 2026')
})

it('names one suite or a run of suites', () => {
  expect(suitesLabel(['500'])).toBe('Suite 500')
  expect(suitesLabel(['700', '710'])).toBe('Suites 700 + 710')
  expect(suitesLabel(['1000', '1010', '1020'])).toBe('Suites 1000 + 1010 + 1020')
  expect(suitesLabel([])).toBe('')
})
