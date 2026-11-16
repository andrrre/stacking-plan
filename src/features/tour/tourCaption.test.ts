import { describe, it, expect } from 'vitest'
import { BUNDLED_BUILDINGS } from '../../data'
import { sliderDate } from '../../domain/dates'
import { findFits } from '../../domain/findFits'
import { building, floor, lease, suite } from '../../domain/testing/fixtures'
import type { Building, Candidate } from '../../domain/types'
import { tourCaption, type CaptionInput } from './tourCaption'
import { tourStops } from './tourStops'

const TODAY = '2026-11-15'
const hero = BUNDLED_BUILDINGS[0]

const stopsOf = (b: Building, asOf: string, includePotential = true) =>
  tourStops({ building: b, buildingId: b.id, asOf, today: TODAY, shortlist: [], matches: [], includePotential })

const stop = (b: Building, key: string, asOf = TODAY) => stopsOf(b, asOf).find((c) => c.key === key) as Candidate

const input = (over: Partial<CaptionInput> & Pick<CaptionInput, 'stop'>): CaptionInput => ({
  building: hero, asOf: TODAY, today: TODAY, includePotential: true, req: null, whatIf: false, index: 0, count: 1, ...over,
})

const textOf = (c: ReturnType<typeof tourCaption>) => [c.title, c.counter, ...c.lines].join('\n')

describe('tourCaption', () => {
  it('a vacant suite: title with its floor, size, available now, asking rent, what it combines with, the stop count', () => {
    const c = tourCaption(input({ stop: stop(hero, 'odt-700'), index: 1, count: 5 }))
    expect(c.title).toBe('Suite 700 · Floor 7')
    expect(c.counter).toBe('2 of 5')
    expect(c.lines).toContain('4,300 SF')
    expect(c.lines).toContain('Available now')
    expect(c.lines.some((l) => /^Asking \$\d+\.\d\d \/SF\/yr$/.test(l))).toBe(true)
    expect(c.lines).toContain('Combines with 710 → 10,500 SF')
  })

  it('a suite on its own run says nothing about combining', () => {
    const c = tourCaption(input({ stop: stop(hero, 'odt-410') }))
    expect(c.lines.some((l) => l.startsWith('Combines'))).toBe(false)
  })

  it('potential space: "Available from MM/YYYY" and the client caveat, never the tenant', () => {
    const asOf = '2027-07-01' // Flamingo Row Media's lease on 600 ended 2027-04-30
    const s = stop(hero, 'odt-600', asOf)
    expect(s.availability).toBe('potential')
    const c = tourCaption(input({ stop: s, asOf }))
    expect(c.lines).toContain('Available from 05/2027')
    expect(c.lines.some((l) => l.startsWith('Subject to the current tenant vacating'))).toBe(true)
    expect(textOf(c)).not.toContain('Flamingo Row Media')
  })

  it('a multi-suite option: both numbers in the title and the combined size', () => {
    const pair = findFits(hero, { minSf: 10_000, includePotential: true }, TODAY, TODAY).find((m) => m.key === 'odt-700+odt-710') as Candidate
    const c = tourCaption(input({ stop: pair }))
    expect(c.title).toBe('Suites 700 + 710 · Floor 7')
    expect(c.lines).toContain('10,500 SF · 2 suites combined')
    expect(c.lines.some((l) => l.startsWith('Combines with'))).toBe(false) // the run is the option itself
  })

  it('with a search: why it works against the requirement', () => {
    const c = tourCaption(input({ stop: stop(hero, 'odt-500'), req: { minSf: 10_000, includePotential: true } }))
    expect(c.lines).toContain('Fits 10,000 SF needed · +250 SF to spare')
  })

  it('a stop under the requirement gets no "fits" line', () => {
    const c = tourCaption(input({ stop: stop(hero, 'odt-410'), req: { minSf: 10_000, includePotential: true } }))
    expect(c.lines.some((l) => l.startsWith('Fits'))).toBe(false)
  })

  it('no asking rent on file: no asking line', () => {
    const b = building({ floors: [floor({ suites: [suite({ id: 's-1', askingRentPsf: undefined })] })] })
    const c = tourCaption(input({ building: b, stop: stop(b, 's-1') }))
    expect(c.lines.some((l) => l.startsWith('Asking'))).toBe(false)
  })

  it('a what-if option says it is indicative', () => {
    const c = tourCaption(input({ stop: stop(hero, 'odt-700'), whatIf: true }))
    expect(c.lines).toContain('Indicative: depends on lease changes not yet confirmed.')
  })

  it('never names a tenant or a lease rent, on any stop of any bundled building, over the slider', () => {
    const texts = BUNDLED_BUILDINGS.flatMap((b) => [0, 6, 12, 24, 36].map((m) => sliderDate(TODAY, m)).flatMap((asOf) =>
      stopsOf(b, asOf).map((s) => ({ b, text: textOf(tourCaption(input({ building: b, asOf, stop: s, req: { minSf: 1000, includePotential: true } }))) }))))
    expect(texts.length).toBeGreaterThan(20)
    for (const { b, text } of texts) {
      const leases = b.floors.flatMap((f) => f.suites.flatMap((s) => s.leases))
      const asking = new Set(b.floors.flatMap((f) => f.suites.map((x) => x.askingRentPsf?.toFixed(2))))
      for (const l of leases) expect(text).not.toContain(l.tenant)
      for (const l of leases.filter((x) => !asking.has(x.rentPsf.toFixed(2)))) expect(text).not.toContain(`$${l.rentPsf.toFixed(2)}`)
    }
  })

  it('a leased suite fixture never leaks its tenant through the caveats', () => {
    const b = building({ floors: [floor({ suites: [suite({ id: 's-1', leases: [lease({ tenant: 'Secret Tenant Co', start: '2020-01-01', end: '2027-01-31' })] })] })] })
    const s = stopsOf(b, '2027-03-01').find((c) => c.key === 's-1') as Candidate
    expect(textOf(tourCaption(input({ building: b, asOf: '2027-03-01', stop: s })))).not.toContain('Secret Tenant Co')
  })
})
