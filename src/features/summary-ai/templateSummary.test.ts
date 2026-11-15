import { describe, it, expect } from 'vitest'
import { SummaryCopySchema, SummaryRequestSchema, type SummaryRequest } from '../../shared/summary.schema'
import { templateSummary } from './templateSummary'

const opt = (over: Partial<SummaryRequest['options'][number]> = {}): SummaryRequest['options'][number] => ({
  label: 'Suite 500', floor: 5, suiteNumbers: ['500'], totalSf: 10_500, blendedRentPsf: 52, availableFrom: '2026-11-15', notes: [], ...over,
})
const req = (options: SummaryRequest['options'], buildingName = 'Ocean Drive Tower'): SummaryRequest => ({ buildingName, asOf: '2026-11-15', options })

const six = opt({ label: 'Suite 600', floor: 6, suiteNumbers: ['600'], totalSf: 12_000, blendedRentPsf: 58, availableFrom: '2027-07-01', notes: ['Subject to the current tenant vacating (30 Apr 2027)'] })

describe('templateSummary', () => {
  it('is deterministic', () => {
    expect(templateSummary(req([opt(), six]))).toEqual(templateSummary(req([opt(), six])))
  })

  it('reads naturally for one option', () => {
    expect(templateSummary(req([opt()]))).toEqual({
      headline: 'Suite 500 at Ocean Drive Tower',
      paragraph: 'Suite 500 on floor 5 offers 10,500 SF at an asking rent of $52.00 per SF per year, available from 15 Nov 2026.',
    })
  })

  it('states the count, the size range, the rent range and the earliest date for several options', () => {
    const copy = templateSummary(req([six, opt()]))
    expect(copy.headline).toBe('Two office options at Ocean Drive Tower')
    expect(copy.paragraph).toContain('10,500 to 12,000 SF')
    expect(copy.paragraph).toContain('$52.00 to $58.00')
    expect(copy.paragraph).toContain('earliest available from 15 Nov 2026 (Suite 500)')
  })

  it('keeps every note, worded as given and tied to its option', () => {
    const copy = templateSummary(req([opt(), six]))
    expect(copy.paragraph).toContain(' Suite 600 – subject to the current tenant vacating (30 Apr 2027).')
    expect(copy.paragraph).not.toContain('Notes:')
  })

  it('writes a single option\'s notes as sentences, each capitalised and closed', () => {
    const whatIf = 'Indicative: depends on lease changes not yet confirmed.'
    const one = templateSummary(req([opt({ notes: [whatIf] })])).paragraph
    expect(one).toBe('Suite 500 on floor 5 offers 10,500 SF at an asking rent of $52.00 per SF per year, available from 15 Nov 2026. '
      + 'Indicative: depends on lease changes not yet confirmed.')
    const two = templateSummary(req([opt({ notes: ['subject to the current tenant vacating (30 Apr 2027)', whatIf] })])).paragraph
    expect(two).toContain('2026. Subject to the current tenant vacating (30 Apr 2027). Indicative: depends on lease changes not yet confirmed.')
    expect(two).not.toMatch(/Note:|indicative:|\.\./)
  })

  it('ties several notes to their option: the first after the label, the rest as sentences', () => {
    const whatIf = 'Indicative: depends on lease changes not yet confirmed.'
    const copy = templateSummary(req([opt({ notes: [whatIf] }), { ...six, notes: [...six.notes, whatIf] }])).paragraph
    expect(copy).toContain('Suite 500 – indicative: depends on lease changes not yet confirmed. '
      + 'Suite 600 – subject to the current tenant vacating (30 Apr 2027). Indicative: depends on lease changes not yet confirmed.')
    expect(copy).not.toMatch(/Notes?:|;|\.\./)
  })

  it('does not collapse equal sizes or rents into a range', () => {
    const copy = templateSummary(req([opt(), opt({ label: 'Suite 510', suiteNumbers: ['510'] })]))
    expect(copy.paragraph).toContain('10,500 SF each')
    expect(copy.paragraph).not.toContain(' to 10,500')
  })

  it('omits the rent when no option has one', () => {
    const copy = templateSummary(req([opt({ blendedRentPsf: undefined })]))
    expect(copy.paragraph).not.toContain('$')
  })

  it('stays inside the schema limits for the longest request', () => {
    const long = Array.from({ length: 5 }, (_, i) => opt({
      label: `Suites ${'7'.repeat(30)}`, suiteNumbers: [String(i)], notes: ['x'.repeat(200)],
    }))
    const r = req(long, 'B'.repeat(120))
    expect(SummaryRequestSchema.safeParse(r).success).toBe(true)
    expect(SummaryCopySchema.safeParse(templateSummary(r)).success).toBe(true)
  })

  it('stays inside the schema limits for typical requests', () => {
    for (const options of [[opt()], [opt(), six], [opt(), six, opt({ label: 'Suites 700 + 710', floor: 7 })]]) {
      expect(SummaryCopySchema.safeParse(templateSummary(req(options))).success).toBe(true)
    }
  })

  it('does not throw for no options, and still returns valid copy', () => {
    const copy = templateSummary(req([]))
    expect(copy.headline).toBe('Ocean Drive Tower')
    expect(SummaryCopySchema.safeParse(copy).success).toBe(true)
  })
})
