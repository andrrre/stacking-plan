import { describe, it, expect } from 'vitest'
import { BuildingSchema } from '../../shared/domain.schema'
import { CSV_COLUMNS, MAX_BYTES, MAX_ROWS, MAX_SHOWN_ERRORS, splitErrors } from './limits'
import { parseCsv } from './parseCsv'
import { CSV_TEMPLATE } from './template'
import type { Building, CsvError, CsvResult, Suite } from '../types'

const HEADER = CSV_COLUMNS.join(',')
const VACANT = 'Bay House,5,500,4000,leasable,40,no,,,,,'
const LEASED = 'Bay House,5,510,3000,leasable,42,no,Gull Media,2025-01-01,2028-12-31,41,no'

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n')
}

function ok(r: CsvResult): Building[] {
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.buildings
}

function errs(r: CsvResult): CsvError[] {
  if (r.ok) throw new Error('expected errors')
  return r.errors
}

function suiteOf(b: Building, id: string): Suite {
  const s = b.floors.flatMap((f) => f.suites).find((x) => x.id === id)
  if (!s) throw new Error(`no suite ${id}`)
  return s
}

describe('CSV_TEMPLATE', () => {
  it('parses with 0 errors into one schema-valid building', () => {
    const [b, ...rest] = ok(parseCsv(CSV_TEMPLATE, []))
    expect(rest).toEqual([])
    expect(BuildingSchema.safeParse(b).success).toBe(true)
  })

  it('shows a multi-lease suite, a vacant suite, a common suite, an open-ended lease and joins_next', () => {
    const [b] = ok(parseCsv(CSV_TEMPLATE, []))
    const suites = b?.floors.flatMap((f) => f.suites) ?? []
    expect(suites.some((s) => s.leases.length > 1)).toBe(true)
    expect(suites.some((s) => s.kind === 'leasable' && s.leases.length === 0)).toBe(true)
    expect(suites.some((s) => s.kind === 'common')).toBe(true)
    expect(suites.some((s) => s.leases.some((l) => l.end === null))).toBe(true)
    expect(suites.some((s) => s.joinsNext)).toBe(true)
  })
})

describe('parseCsv: a valid file', () => {
  it('builds ids, floors descending, suites in first-appearance order and leases', () => {
    const text = csv(
      'Bay House,4,410,2000,leasable,38,yes,,,,,',
      VACANT,
      'Bay House,4,400,2500,leasable,39,no,Tern Labs,2024-02-01,,37.5,',
      LEASED,
    )
    const [b] = ok(parseCsv(text, []))
    expect(b).toMatchObject({ id: 'csv-bay-house', name: 'Bay House', address: '' })
    expect(b?.floors.map((f) => f.number)).toEqual([5, 4])
    expect(b?.floors[1]?.suites.map((s) => s.number)).toEqual(['410', '400'])
    expect(suiteOf(b as Building, 'csv-bay-house-4-410')).toMatchObject({ areaSf: 2000, askingRentPsf: 38, joinsNext: true, leases: [] })
    expect(suiteOf(b as Building, 'csv-bay-house-4-400').leases).toEqual([
      { id: 'csv-bay-house-4-400-l1', tenant: 'Tern Labs', start: '2024-02-01', end: null, rentPsf: 37.5, vacating: false },
    ])
  })

  it('groups several leases into one suite and numbers lease ids by start date', () => {
    const text = csv(
      'Bay House,5,510,3000,leasable,42,no,Later Co,2029-01-01,2031-12-31,45,',
      LEASED,
    )
    const [b] = ok(parseCsv(text, []))
    const leases = suiteOf(b as Building, 'csv-bay-house-5-510').leases
    expect(leases.map((l) => [l.id, l.tenant])).toEqual([
      ['csv-bay-house-5-510-l1', 'Gull Media'],
      ['csv-bay-house-5-510-l2', 'Later Co'],
    ])
  })

  it('never produces a lease id starting with scn-', () => {
    const text = csv('scn,1,1,1000,leasable,10,no,A,2025-01-01,,10,')
    const [b] = ok(parseCsv(text, []))
    const ids = b?.floors.flatMap((f) => f.suites.flatMap((s) => s.leases.map((l) => l.id))) ?? []
    expect(ids.length).toBe(1)
    expect(ids.every((id) => !id.startsWith('scn-'))).toBe(true)
  })

  it('accepts the header in any order, any case, with spaces', () => {
    const cols = [...CSV_COLUMNS].reverse()
    const header = cols.map((c) => ` ${c.toUpperCase()} `).join(',')
    const row = LEASED.split(',').reverse().join(',')
    const [b] = ok(parseCsv(`${header}\n${row}`, []))
    expect(suiteOf(b as Building, 'csv-bay-house-5-510').leases[0]?.tenant).toBe('Gull Media')
  })

  it('handles a BOM, CRLF and quoted commas', () => {
    const text = `\uFEFF${HEADER}\r\n"Bay House, North",5,500,"4,000",leasable,$40.00,no,"Kestrel & Pine, CPAs",2025-01-01,,40,\r\n`
    const [b] = ok(parseCsv(text, []))
    expect(b?.name).toBe('Bay House, North')
    const s = b?.floors[0]?.suites[0]
    expect(s).toMatchObject({ areaSf: 4000, askingRentPsf: 40 })
    expect(s?.leases[0]?.tenant).toBe('Kestrel & Pine, CPAs')
  })

  it.each([
    ['true', true], ['TRUE', true], ['yes', true], ['Y', false], ['1', true],
    ['false', false], ['no', false], ['0', false], ['', false],
  ])('reads joins_next %j', (raw, expected) => {
    const r = parseCsv(csv(`Bay House,5,500,4000,leasable,40,${raw},,,,,`), [])
    if (raw === 'Y') {
      expect(errs(r)[0]).toMatchObject({ row: 2, column: 'joins_next' })
      return
    }
    expect(ok(r)[0]?.floors[0]?.suites[0]?.joinsNext).toBe(expected)
  })

  it('reads vacating forms', () => {
    const text = csv('Bay House,5,510,3000,leasable,42,no,Gull Media,2025-01-01,2028-12-31,41,Yes')
    expect(suiteOf(ok(parseCsv(text, []))[0] as Building, 'csv-bay-house-5-510').leases[0]?.vacating).toBe(true)
  })

  it('keeps a common suite without asking rent', () => {
    const [b] = ok(parseCsv(csv('Bay House,1,100,1500,Common,,no,,,,,'), []))
    expect(b?.floors[0]?.suites[0]).toMatchObject({ kind: 'common', joinsNext: false, leases: [] })
    expect(b?.floors[0]?.suites[0]).not.toHaveProperty('askingRentPsf')
  })

  it('splits rows into several buildings by the building column, case-insensitively', () => {
    const text = csv(VACANT, 'Gulf Point,2,200,1000,leasable,30,no,,,,,', 'bay house,5,520,900,leasable,40,no,,,,,')
    const bs = ok(parseCsv(text, []))
    expect(bs.map((b) => [b.id, b.name])).toEqual([['csv-bay-house', 'Bay House'], ['csv-gulf-point', 'Gulf Point']])
    expect(bs[0]?.floors[0]?.suites.map((s) => s.number)).toEqual(['500', '520'])
  })

  it('skips fully blank rows but keeps spreadsheet row numbers', () => {
    const r = parseCsv(csv(VACANT, ',,,,,,,,,,,', '', 'Bay House,5,500,4000,leasable,40,no,,,,,'), [])
    expect(errs(r)[0]?.row).toBe(5)
  })
})

describe('parseCsv: building ids', () => {
  it('uses csv-{slug}', () => {
    expect(ok(parseCsv(csv('  Bayfront Commons #2 ,1,1,10,leasable,1,no,,,,,'), []))[0]?.id).toBe('csv-bayfront-commons-2')
  })

  it('adds a numeric suffix on collision with existing ids and within the file', () => {
    const text = csv('Bay House,1,1,10,leasable,1,no,,,,,', 'Bay-House,1,1,10,leasable,1,no,,,,,')
    const ids = ok(parseCsv(text, ['odt', 'csv-bay-house'])).map((b) => b.id)
    expect(ids).toEqual(['csv-bay-house-2', 'csv-bay-house-3'])
  })

  it('falls back to csv-building when the name has no letters or digits', () => {
    expect(ok(parseCsv(csv('東京,1,1,10,leasable,1,no,,,,,'), []))[0]?.id).toBe('csv-building')
  })
})

describe('parseCsv: header errors (row 1)', () => {
  it('reports an unknown column and a missing column', () => {
    const header = HEADER.replace('vacating', 'notes')
    const e = errs(parseCsv(`${header}\n${VACANT}`, []))
    expect(e).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 1, column: null, message: expect.stringContaining('notes') }),
      expect.objectContaining({ row: 1, column: 'vacating' }),
    ]))
  })

  it('reports a repeated column', () => {
    const e = errs(parseCsv(`${HEADER},tenant\n${VACANT},`, []))
    expect(e[0]).toMatchObject({ row: 1, column: 'tenant' })
  })

  it('reports an empty file and a header-only file', () => {
    expect(errs(parseCsv('', []))[0]).toMatchObject({ row: 1, column: null })
    expect(errs(parseCsv(`${HEADER}\n`, []))[0]?.message).toMatch(/no rows/i)
  })
})

describe('parseCsv: row errors carry spreadsheet row, column and an actionable message', () => {
  it('a bad date, a duplicate suite and an overlapping lease are each reported, and nothing is imported', () => {
    const text = csv(
      'Bay House,5,510,3000,leasable,42,no,Gull Media,2025-02-30,2028-12-31,41,no', // row 2 bad date
      VACANT, // row 3
      'Bay House,5,500,4000,leasable,40,no,,,,,', // row 4 duplicate of 3
      'Bay House,4,400,3000,leasable,42,no,Tern Labs,2025-01-01,2027-12-31,41,', // row 5
      'Bay House,4,400,3000,leasable,42,no,Heron Ltd,2027-06-01,2030-05-31,44,', // row 6 overlaps 5
    )
    const r = parseCsv(text, [])
    expect(r.ok).toBe(false)
    const e = errs(r)
    expect(e).toEqual([
      expect.objectContaining({ row: 2, column: 'lease_start', message: expect.stringMatching(/YYYY-MM-DD/) }),
      expect.objectContaining({ row: 4, column: 'suite', message: expect.stringContaining('row 3') }),
      expect.objectContaining({ row: 6, column: 'lease_start', message: expect.stringContaining('row 5') }),
    ])
  })

  it('a tenant without lease_start or rent_psf is an error', () => {
    const e = errs(parseCsv(csv('Bay House,5,510,3000,leasable,42,no,Gull Media,,,,'), []))
    expect(e.map((x) => x.column)).toEqual(['lease_start', 'rent_psf'])
  })

  it('lease columns without a tenant are an error', () => {
    const e = errs(parseCsv(csv('Bay House,5,510,3000,leasable,42,no,,2025-01-01,,41,yes'), []))
    expect(e.map((x) => x.column)).toEqual(['lease_start', 'rent_psf', 'vacating'])
    expect(e[0]?.message).toMatch(/tenant/i)
  })

  it('a lease on a common suite is an error, as is asking rent on one', () => {
    const e = errs(parseCsv(csv('Bay House,1,100,1500,common,30,no,Lobby Cafe,2025-01-01,,10,'), []))
    expect(e.map((x) => x.column)).toEqual(['asking_rent_psf', 'tenant'])
  })

  it('a leasable suite needs an asking rent', () => {
    expect(errs(parseCsv(csv('Bay House,5,500,4000,leasable,,no,,,,,'), []))[0]).toMatchObject({ row: 2, column: 'asking_rent_psf' })
  })

  it('lease_end before lease_start is an error', () => {
    const e = errs(parseCsv(csv('Bay House,5,510,3000,leasable,42,no,Gull,2028-01-01,2027-12-31,41,'), []))
    expect(e[0]).toMatchObject({ row: 2, column: 'lease_end' })
  })

  it.each([
    ['floor', 'Bay House,five,500,4000,leasable,40,no,,,,,'],
    ['floor', 'Bay House,2.5,500,4000,leasable,40,no,,,,,'],
    ['area_sf', 'Bay House,5,500,0,leasable,40,no,,,,,'],
    ['area_sf', 'Bay House,5,500,12.5,leasable,40,no,,,,,'],
    ['kind', 'Bay House,5,500,4000,office,40,no,,,,,'],
    ['asking_rent_psf', 'Bay House,5,500,4000,leasable,-3,no,,,,,'],
    ['building', ',5,500,4000,leasable,40,no,,,,,'],
    ['suite', 'Bay House,5,,4000,leasable,40,no,,,,,'],
    ['suite', 'Bay House,5,5<b>,4000,leasable,40,no,,,,,'],
    ['rent_psf', 'Bay House,5,510,3000,leasable,42,no,Gull,2025-01-01,,lots,'],
    ['tenant', `Bay House,5,510,3000,leasable,42,no,${'x'.repeat(81)},2025-01-01,,41,`],
  ])('rejects a bad %s value', (column, row) => {
    expect(errs(parseCsv(csv(row), []))[0]).toMatchObject({ row: 2, column })
  })

  it('suite-level columns that differ across a suite\'s rows are an error', () => {
    const text = csv(LEASED, 'Bay House,5,510,3100,leasable,45,yes,Later Co,2029-01-01,,45,')
    const e = errs(parseCsv(text, []))
    expect(e.map((x) => [x.row, x.column])).toEqual([[3, 'area_sf'], [3, 'asking_rent_psf'], [3, 'joins_next']])
    expect(e[0]?.message).toContain('row 2')
  })

  it('a row with the wrong number of cells is an error', () => {
    expect(errs(parseCsv(csv('Bay House,5,500'), []))[0]).toMatchObject({ row: 2, column: null })
  })

  it('collects errors from every row', () => {
    const e = errs(parseCsv(csv('Bay House,x,500,4000,leasable,40,no,,,,,', 'Bay House,5,500,-1,leasable,40,no,,,,,'), []))
    expect(e.map((x) => x.row)).toEqual([2, 3])
  })

  it('the same suite number on different floors is fine', () => {
    expect(ok(parseCsv(csv(VACANT, 'Bay House,4,500,4000,leasable,40,no,,,,,'), []))[0]?.floors).toHaveLength(2)
  })
})

describe('parseCsv: limits and non-text input', () => {
  it(`rejects text over ${MAX_BYTES} bytes before parsing`, () => {
    const e = errs(parseCsv(`${HEADER}\n${'x'.repeat(MAX_BYTES)}`, []))
    expect(e).toHaveLength(1)
    expect(e[0]?.message).toMatch(/1 MB/)
  })

  it(`accepts ${MAX_ROWS} rows and rejects ${MAX_ROWS + 1}`, () => {
    const rows = Array.from({ length: MAX_ROWS }, (_, i) => `Bay House,1,${i + 1},10,leasable,1,no,,,,,`)
    expect(parseCsv(csv(...rows), []).ok).toBe(true)
    const e = errs(parseCsv(csv(...rows, 'Bay House,1,x,10,leasable,1,no,,,,,'), []))
    expect(e).toHaveLength(1)
    expect(e[0]?.message).toMatch(/2,000 rows/)
  })

  it('rejects binary content such as an .xlsx renamed to .csv', () => {
    const e = errs(parseCsv('PK\u0003\u0004\u0000\u0000��xl/workbook.xml', []))
    expect(e).toHaveLength(1)
    expect(e[0]).toMatchObject({ row: 0, column: null, message: expect.stringMatching(/CSV/) })
  })

  it('reports every error, and splitErrors shows only the first 50', () => {
    const rows = Array.from({ length: 70 }, (_, i) => `Bay House,1,${i + 1},bad,leasable,1,no,,,,,`)
    const e = errs(parseCsv(csv(...rows), []))
    expect(e).toHaveLength(70)
    const { shown, hidden } = splitErrors(e)
    expect(shown).toHaveLength(MAX_SHOWN_ERRORS)
    expect(shown[0]?.row).toBe(2)
    expect(hidden).toBe(20)
  })

  it('rejects a near-1 MB row or header of commas with one error, without hanging', () => {
    const commas = ','.repeat(MAX_BYTES - 500)
    expect(errs(parseCsv(`${HEADER}\n${commas}`, []))).toEqual([expect.objectContaining({ row: 2, column: null })])
    expect(errs(parseCsv(commas, []))).toEqual([expect.objectContaining({ row: 1, column: null })])
  })

  it('keeps hostile text as plain data', () => {
    const text = csv(
      'Bay House,5,510,3000,leasable,42,no,<img src=x onerror=alert(1)>,2025-01-01,,41,',
      'Bay House,5,520,3000,leasable,42,no,"=HYPERLINK(""http://x"",""y"")",2025-01-01,,41,',
    )
    const [b] = ok(parseCsv(text, []))
    const tenants = b?.floors[0]?.suites.map((s) => s.leases[0]?.tenant)
    expect(tenants).toEqual(['<img src=x onerror=alert(1)>', '=HYPERLINK("http://x","y")'])
  })
})

describe('parseCsv: review fixes', () => {
  const ID_SAFE = /^[A-Za-z0-9-]+$/

  it.each([
    ['Suite 300', 'csv-bay-house-5-Suite-300'],
    ['3.01', 'csv-bay-house-5-3-01'],
    ['300/310', 'csv-bay-house-5-300-310'],
    ['#300', 'csv-bay-house-5--300'],
    ['PH 1', 'csv-bay-house-5-PH-1'],
  ])('accepts the suite number %j, keeps it for display and builds a safe id', (number, id) => {
    const [b] = ok(parseCsv(csv(`Bay House,5,${number},4000,leasable,40,no,,,,,`), []))
    const s = b?.floors[0]?.suites[0]
    expect(s).toMatchObject({ number, id })
    expect(s?.id).toMatch(ID_SAFE)
  })

  it('reports two suite numbers on one floor that make the same id as a duplicate on the later row', () => {
    const e = errs(parseCsv(csv('Bay House,5,3.01,4000,leasable,40,no,,,,,', 'Bay House,5,3/01,4000,leasable,40,no,,,,,'), []))
    expect(e).toEqual([expect.objectContaining({ row: 3, column: 'suite', message: expect.stringContaining('row 2') })])
  })

  it('does not count blank rows toward the row limit, and keeps spreadsheet row numbers', () => {
    const text = `${HEADER}\n${'\n'.repeat(2500)}${VACANT}\n`
    expect(ok(parseCsv(text, []))[0]?.floors[0]?.suites[0]?.number).toBe('500')
    const bad = `${HEADER}\n${'\n'.repeat(2500)}Bay House,x,500,4000,leasable,40,no,,,,,\n`
    expect(errs(parseCsv(bad, []))[0]).toMatchObject({ row: 2502, column: 'floor' })
  })

  it('still stops early on a file of nothing but empty lines', () => {
    const e = errs(parseCsv(`${HEADER}\n${'\n'.repeat(20_000)}`, []))
    expect(e).toHaveLength(1)
    expect(e[0]?.column).toBeNull()
  })

  it('vacating on a lease with no end date is an error', () => {
    const e = errs(parseCsv(csv('Bay House,5,510,3000,leasable,42,no,Gull Media,2025-01-01,,41,yes'), []))
    expect(e).toEqual([{ row: 2, column: 'vacating', message: 'A lease with no end date cannot be vacating. Enter lease_end, or set vacating to no.' }])
  })

  it('skips blank rows before the header and numbers rows from the real header row', () => {
    const [b] = ok(parseCsv(`\n\n${HEADER}\n${VACANT}`, []))
    expect(b?.id).toBe('csv-bay-house')
    const e = errs(parseCsv(`\n${HEADER.replace('vacating', 'notes')}\nBay House,x,500,4000,leasable,40,no,,,,,`, []))
    expect(e.every((x) => x.row === 2)).toBe(true)
  })

  it('a title row instead of the header is one whole-file error', () => {
    const e = errs(parseCsv(`Rent roll 2026\n${HEADER}\n${VACANT}`, []))
    expect(e).toEqual([expect.objectContaining({ row: 0, column: null, message: expect.stringMatching(/^The first row must be the header: building, floor, suite, /) })])
  })

  it('a Windows-1252 file gets its own UTF-8 message; NUL keeps the workbook message', () => {
    expect(errs(parseCsv(csv('Caf�,5,500,4000,leasable,40,no,,,,,'), []))[0]?.message).toMatch(/not saved as UTF-8.*accented letters/)
    expect(errs(parseCsv('a\u0000b', []))[0]?.message).toMatch(/Excel workbook/)
  })

  it.each([['6,200.00', 6200], ['6200.0', 6200]])('accepts the area %j as a whole number', (raw, area) => {
    const [b] = ok(parseCsv(csv(`Bay House,5,500,"${raw}",leasable,40,no,,,,,`), []))
    expect(b?.floors[0]?.suites[0]?.areaSf).toBe(area)
  })

  it('rejects the area 6200.5', () => {
    expect(errs(parseCsv(csv('Bay House,5,500,6200.5,leasable,40,no,,,,,'), []))[0]).toMatchObject({ row: 2, column: 'area_sf' })
  })

  it('ignores a trailing column that is empty in the header and in every row', () => {
    const text = `${HEADER},\n${VACANT},\n${LEASED},\n`
    expect(ok(parseCsv(text, []))[0]?.floors[0]?.suites).toHaveLength(2)
  })

  it('keeps a trailing unnamed column with data as an error', () => {
    const e = errs(parseCsv(`${HEADER},\n${VACANT},note\n`, []))
    expect(e[0]).toMatchObject({ row: 1, column: null, message: expect.stringMatching(/no name/) })
  })

  it('a suffixed id also numbers the display name', () => {
    const [b] = ok(parseCsv(csv(VACANT), ['csv-bay-house']))
    expect(b).toMatchObject({ id: 'csv-bay-house-2', name: 'Bay House (2)' })
    const [c] = ok(parseCsv(csv(VACANT), []))
    expect(c?.name).toBe('Bay House')
  })
})
