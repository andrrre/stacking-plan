import { describe, it, expect } from 'vitest'
import raw from './ocean-drive-tower.json'
import { BuildingSchema } from '../shared/domain.schema'
import { statusAt } from '../domain/status'
import { addMonthsIso } from '../domain/dates'
import type { Floor, Suite } from '../domain/types'

const TODAY = '2026-11-15'
const hero = BuildingSchema.parse(raw)
const suites = hero.floors.flatMap((f) => f.suites)

function floorOf(n: number): Floor {
  const f = hero.floors.find((x) => x.number === n)
  if (!f) throw new Error(`no floor ${n}`)
  return f
}
function suiteOf(n: string): Suite {
  const s = suites.find((x) => x.number === n)
  if (!s) throw new Error(`no suite ${n}`)
  return s
}
const statusToday = (n: string) => statusAt(suiteOf(n), TODAY, TODAY)
const isPlainVacant = (n: string) => {
  const st = statusToday(n)
  return st.status === 'vacant' && st.overlay === 'none'
}

describe('hero building shape (A14)', () => {
  it('parses with BuildingSchema', () => {
    expect(BuildingSchema.safeParse(raw).success).toBe(true)
    expect(hero.id).toBe('odt')
    expect(hero.name).toBe('Ocean Drive Tower')
  })
  it('has 12 floors, 32 suites, 29 leasable, 134,800 leasable SF', () => {
    expect(hero.floors).toHaveLength(12)
    expect(hero.floors.map((f) => f.number)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
    expect(suites).toHaveLength(32)
    const leasable = suites.filter((s) => s.kind === 'leasable')
    expect(leasable).toHaveLength(29)
    expect(leasable.reduce((sum, s) => sum + s.areaSf, 0)).toBe(134_800)
  })
  it('uses ids odt-<number> and lease ids odt-<number>-l<n>', () => {
    for (const s of suites) {
      expect(s.id).toBe(`odt-${s.number}`)
      for (const l of s.leases) expect(l.id).toMatch(new RegExp(`^odt-${s.number}-l\\d+$`))
    }
  })
})

describe('DESIGN §7 "must contain"', () => {
  it('a single vacant suite of 10,000+ SF: 500', () => {
    expect(isPlainVacant('500')).toBe(true)
    expect(suiteOf('500').areaSf).toBeGreaterThanOrEqual(10_000)
  })

  it('a 10,000+ SF answer only by combining neighbours: 700+710', () => {
    const [a, b] = floorOf(7).suites
    expect([a?.number, b?.number]).toEqual(['700', '710'])
    expect(a?.joinsNext).toBe(true)
    expect(isPlainVacant('700') && isPlainVacant('710')).toBe(true)
    expect(suiteOf('700').areaSf).toBeLessThan(10_000)
    expect(suiteOf('710').areaSf).toBeLessThan(10_000)
    expect(suiteOf('700').areaSf + suiteOf('710').areaSf).toBeGreaterThanOrEqual(10_000)
  })

  it('neighbouring vacant suites that add to 10,000+ SF but cannot combine: 300 and 310', () => {
    const [a, b] = floorOf(3).suites
    expect([a?.number, b?.number]).toEqual(['300', '310'])
    expect(a?.joinsNext).toBe(false)
    expect(isPlainVacant('300') && isPlainVacant('310')).toBe(true)
    expect(suiteOf('300').areaSf + suiteOf('310').areaSf).toBeGreaterThanOrEqual(10_000)
  })

  it('a 10,000+ SF suite whose lease ends in 5–9 months: 600', () => {
    const st = statusToday('600')
    expect(st.status).toBe('expiring')
    const end = st.status === 'expiring' ? st.lease.end : null
    expect(end).not.toBeNull()
    expect(end! >= addMonthsIso(TODAY, 5) && end! <= addMonthsIso(TODAY, 9)).toBe(true)
    expect(suiteOf('600').areaSf).toBeGreaterThanOrEqual(10_000)
    expect(suiteOf('600').leases.some((l) => l.vacating)).toBe(false)
  })

  it('committed: 1010', () => {
    expect(statusToday('1010')).toMatchObject({ status: 'vacant', overlay: 'committed' })
  })

  it('exactly one vacating lease: 400', () => {
    const vacating = suites.filter((s) => s.leases.some((l) => l.vacating))
    expect(vacating.map((s) => s.number)).toEqual(['400'])
  })

  it('one open-ended lease: 230', () => {
    const open = suites.filter((s) => s.leases.some((l) => l.end === null))
    expect(open.map((s) => s.number)).toEqual(['230'])
    expect(statusToday('230')).toMatchObject({ status: 'occupied', openEnded: true })
  })

  it('full-floor tenants on floors 12, 9 and 6', () => {
    for (const n of [12, 9, 6]) {
      const f = floorOf(n)
      expect(f.suites).toHaveLength(1)
      expect(f.suites[0]?.leases.length).toBeGreaterThan(0)
    }
  })

  it('floors split 2–4 ways', () => {
    const counts = hero.floors.filter((f) => f.number !== 1).map((f) => f.suites.length)
    expect(counts.filter((c) => c >= 2 && c <= 4).length).toBeGreaterThanOrEqual(5)
    expect(new Set(counts)).toEqual(new Set([1, 2, 3, 4]))
  })

  it('common space on floor 1, with display names', () => {
    const f = floorOf(1)
    expect(f.suites.map((s) => s.kind)).toEqual(['common', 'common', 'common'])
    expect(f.suites.map((s) => s.name)).toEqual(['Lobby', 'Fitness centre', 'Conference centre'])
    expect(suites.filter((s) => s.kind === 'common')).toHaveLength(3)
  })

  it('lease ends spread across five years', () => {
    const years = new Set(
      suites.flatMap((s) => s.leases).filter((l) => l.end !== null && l.end >= TODAY).map((l) => l.end!.slice(0, 4)),
    )
    for (const y of ['2027', '2028', '2029', '2030', '2031']) expect(years.has(y)).toBe(true)
  })
})
