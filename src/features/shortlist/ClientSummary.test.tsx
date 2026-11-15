import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initState } from '../../app/state/init'
import type { Action, AppState } from '../../app/state/types'
import { AppStateContext } from '../../app/state/useAppState'
import { BUNDLED_BUILDINGS } from '../../data'
import { findFits } from '../../domain/findFits'
import { formatPsf } from '../../domain/format'
import type { Building, Candidate } from '../../domain/types'
import { createEntry } from './entryId'
import { ClientSummary } from './ClientSummary'

const TODAY = '2026-11-15'
const JUL = '2027-07-01'
const hero = BUNDLED_BUILDINGS[0]
const req = { minSf: 10_000, includePotential: true }

const nowMatch = findFits(hero, req, TODAY, TODAY).find((c) => c.key === 'odt-500') as Candidate
const potential = findFits(hero, req, JUL, TODAY).find((c) => c.key === 'odt-600') as Candidate

const tenants = (b: Building) => b.floors.flatMap((f) => f.suites.flatMap((s) => s.leases.map((l) => l.tenant)))
const ALL_TENANTS = BUNDLED_BUILDINGS.flatMap(tenants)

function renderSummary(over: Partial<AppState> = {}) {
  const state: AppState = { ...initState('', null, TODAY), overlay: 'summary', ...over }
  const dispatch = vi.fn<(a: Action) => void>()
  render(
    <AppStateContext.Provider value={{ state, dispatch }}>
      <ClientSummary />
    </AppStateContext.Provider>,
  )
  return { dispatch, text: screen.getByTestId('client-summary').textContent ?? '' }
}

const placed = createEntry(hero.id, {
  ...nowMatch, key: 'odt-placed', caveats: [{ kind: 'assumesNoRenewal', tenant: 'Placed Co', leaseEnd: '2027-04-30' }],
}, TODAY, true)

const shortlist = [
  createEntry(hero.id, nowMatch, TODAY, false),
  createEntry(hero.id, potential, JUL, false),
  createEntry(hero.id, nowMatch, TODAY, true),
  placed,
]

describe('ClientSummary leak check', () => {
  it('the fixture can fail: the stored caveat names the tenant', () => {
    expect(JSON.stringify(potential.caveats)).toContain('Flamingo Row Media')
    expect(ALL_TENANTS).toContain('Flamingo Row Media')
  })

  it('shows no tenant name from either building', () => {
    const { text } = renderSummary({ shortlist })
    expect(ALL_TENANTS.length).toBeGreaterThan(40)
    for (const t of ALL_TENANTS) expect(text, t).not.toContain(t)
  })

  it('shows asking rents only: every lease rent that differs from a shown asking rent is absent', () => {
    const { text } = renderSummary({ shortlist })
    const asking = new Set(shortlist.map((e) => formatPsf(e.candidate.blendedRentPsf)))
    const leaseRents = new Set(hero.floors.flatMap((f) => f.suites.flatMap((s) => s.leases.map((l) => formatPsf(l.rentPsf)))))
    const leaked = [...leaseRents].filter((r) => !asking.has(r) && text.includes(r))
    expect(leaseRents.size).toBeGreaterThan(5)
    expect(leaked).toEqual([])
    const shown = text.match(/\$\d[\d,]*\.\d{2}/g) ?? []
    expect(shown.length).toBeGreaterThan(0)
    for (const m of shown) expect(asking.has(m), m).toBe(true)
  })

  it('carries no tenant name in any attribute value of any element', () => {
    renderSummary({ shortlist })
    const root = screen.getByTestId('client-summary')
    const values = [root, ...root.querySelectorAll('*')].flatMap((el) => [...el.attributes].map((a) => a.value)).join('|')
    expect(values.length).toBeGreaterThan(100)
    for (const t of [...ALL_TENANTS, 'Placed Co']) expect(values).not.toContain(t)
  })

  it('hides a tenant named in a what-if caveat but keeps the client wording and the indicative line', () => {
    const { text } = renderSummary({ shortlist: [placed] })
    expect(JSON.stringify(placed.candidate.caveats)).toContain('Placed Co')
    expect(text).not.toContain('Placed Co')
    expect(text).toContain('Subject to the current tenant vacating (30 Apr 2027)')
    expect(text).toContain('Indicative: depends on lease changes not yet confirmed.')
  })

  it('shows no lease rent as a plain number either', () => {
    const { text } = renderSummary({ shortlist })
    const asking = shortlist.map((e) => e.candidate.blendedRentPsf)
    const leaseRents = new Set(hero.floors.flatMap((f) => f.suites.flatMap((s) => s.leases.map((l) => l.rentPsf))))
    const numbers = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
    const leaked = [...leaseRents].filter((r) => !asking.includes(r) && numbers.includes(r))
    expect(leaked).toEqual([])
  })
})

describe('ClientSummary content', () => {
  it('uses client wording, the prepared date and the what-if line', () => {
    const { text } = renderSummary({ shortlist })
    expect(text).toContain('Subject to the current tenant vacating (30 Apr 2027)')
    expect(text).toContain('Prepared 15 Nov 2026')
    expect(text).toContain('Indicative: depends on lease changes not yet confirmed.')
    expect(text).toContain(hero.name)
  })

  it('prints each option with its own available-from date and asking rent', () => {
    renderSummary({ shortlist })
    const table = screen.getByTestId('compare-table')
    const rows = within(table).getAllByTestId(/^compare-row-/)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toHaveTextContent('15 Nov 2026')
    expect(rows[1]).toHaveTextContent('1 May 2027')
    expect(rows[1]).toHaveTextContent('$50.00')
  })

  it('outlines and numbers the options on a layout-only mini stack', () => {
    renderSummary({ shortlist: shortlist.slice(0, 2) })
    expect(screen.getByTestId('match-outline-1')).toHaveTextContent('500')
    expect(screen.getByTestId('match-outline-2')).toHaveTextContent('600')
  })

  it('two options covering the same suites share one outline that shows both numbers', () => {
    const again = createEntry(hero.id, nowMatch, JUL, false)
    renderSummary({ shortlist: [shortlist[0]!, shortlist[1]!, again] })
    expect(screen.getByTestId('match-outline-1')).toHaveTextContent('1 · 3')
    expect(screen.queryByTestId('match-outline-3')).toBeNull()
    expect(within(screen.getByTestId('compare-table')).getAllByTestId(/^compare-row-/)).toHaveLength(3)
  })

  it('lists only the current building and never reveals a status colour', () => {
    const other = BUNDLED_BUILDINGS[1]!
    const foreign = createEntry(other.id, { ...nowMatch, key: 'pbp-x' }, TODAY, false)
    renderSummary({ shortlist: [foreign, shortlist[0]!] })
    expect(within(screen.getByTestId('compare-table')).getAllByTestId(/^compare-row-/)).toHaveLength(1)
    expect(screen.getByTestId('client-summary').querySelector('[data-status]')).toBeNull()
  })

  it('still renders an entry whose suites no longer exist in the building', () => {
    const ghost = createEntry(hero.id, { ...nowMatch, key: 'gone', suiteNumbers: ['9999'], floor: 99 }, TODAY, false)
    const { text } = renderSummary({ shortlist: [ghost] })
    expect(text).toContain('Suite 9999')
    expect(screen.queryByTestId('match-outline-1')).toBeNull()
  })

  it('print calls window.print; close dispatches overlay none and Escape closes', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const { dispatch } = renderSummary({ shortlist })
    await userEvent.click(screen.getByTestId('summary-print'))
    expect(print).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByTestId('summary-close'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'overlay/set', overlay: 'none' })
    dispatch.mockClear()
    await userEvent.keyboard('{Escape}')
    expect(dispatch).toHaveBeenCalledWith({ type: 'overlay/set', overlay: 'none' })
    print.mockRestore()
  })
})
