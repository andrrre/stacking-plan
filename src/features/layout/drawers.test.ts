import { describe, it, expect } from 'vitest'
import { initState } from '../../app/state/init'
import type { AppState, RequirementDraft, Selection } from '../../app/state/types'
import type { Candidate } from '../../domain/types'
import { dismissalFor, panelView, rightDrawerOpen } from './drawers'

const base = initState('', null, '2026-11-15')

function stateWith(selection: Selection, req: Partial<RequirementDraft> = {}): AppState {
  return { ...base, selection, req: { ...base.req, ...req } }
}

const candidate = { key: 'odt-500', suiteIds: ['odt-500'], suiteNumbers: ['500'] } as unknown as Candidate
const MATCHES: readonly Candidate[] = [candidate]
const SEARCH = { minSf: 10_000 }

describe('panelView (match → suite → requirement → empty)', () => {
  it('a current match selection shows the match with its rank', () => {
    expect(panelView(stateWith({ kind: 'match', key: 'odt-500' }, SEARCH), MATCHES)).toEqual({ kind: 'match', candidate, rank: 1 })
  })
  it('a suite selection shows the suite', () => {
    expect(panelView(stateWith({ kind: 'suite', suiteId: 'odt-600' }), [])).toEqual({ kind: 'suite', suiteId: 'odt-600' })
  })
  it('a stale match with a search falls through to the list', () => {
    expect(panelView(stateWith({ kind: 'match', key: 'gone' }, SEARCH), MATCHES)).toEqual({ kind: 'list' })
  })
  it('an active requirement with no selection shows the list (also when nothing fits)', () => {
    expect(panelView(stateWith(null, SEARCH), [])).toEqual({ kind: 'list' })
  })
  it('nothing selected and no requirement is empty', () => {
    expect(panelView(stateWith(null), [])).toEqual({ kind: 'empty' })
    expect(panelView(stateWith({ kind: 'match', key: 'odt-500' }), [])).toEqual({ kind: 'empty' })
  })
})

describe('rightDrawerOpen', () => {
  it('is closed when there is nothing to show', () => {
    expect(rightDrawerOpen(stateWith(null), [], null)).toBe(false)
  })
  it('opens for a selected suite, a selected match and the match list', () => {
    expect(rightDrawerOpen(stateWith({ kind: 'suite', suiteId: 'odt-600' }), [], null)).toBe(true)
    expect(rightDrawerOpen(stateWith({ kind: 'match', key: 'odt-500' }, SEARCH), MATCHES, null)).toBe(true)
    expect(rightDrawerOpen(stateWith(null, SEARCH), MATCHES, null)).toBe(true)
  })
  it('opens for the no-fit explanation (a search with no matches)', () => {
    expect(rightDrawerOpen(stateWith(null, SEARCH), [], null)).toBe(true)
  })
  it('a dismissed list stays closed while the requirement and selection are unchanged', () => {
    const s = stateWith(null, SEARCH)
    expect(rightDrawerOpen(s, MATCHES, dismissalFor(s))).toBe(false)
    expect(rightDrawerOpen({ ...s, asOf: '2027-01-01' }, MATCHES, dismissalFor(s))).toBe(false)
  })
  it('re-opens when the requirement changes', () => {
    const s = stateWith(null, SEARCH)
    const changed = { ...s, req: { ...s.req, minSf: 12_000 } }
    expect(rightDrawerOpen(changed, MATCHES, dismissalFor(s))).toBe(true)
  })
  it('re-opens when a suite or a match is selected after the dismissal', () => {
    const s = stateWith(null, SEARCH)
    expect(rightDrawerOpen({ ...s, selection: { kind: 'suite', suiteId: 'odt-600' } }, MATCHES, dismissalFor(s))).toBe(true)
    expect(rightDrawerOpen({ ...s, selection: { kind: 'match', key: 'odt-500' } }, MATCHES, dismissalFor(s))).toBe(true)
  })
  it('a dismissal taken while a suite is selected hides it until another selection (narrow layout)', () => {
    const s = stateWith({ kind: 'suite', suiteId: 'odt-600' })
    expect(rightDrawerOpen(s, [], dismissalFor(s))).toBe(false)
    expect(rightDrawerOpen({ ...s, selection: { kind: 'suite', suiteId: 'odt-600' } }, [], dismissalFor(s))).toBe(true)
  })
  it('a dismissal never opens the drawer on an empty view', () => {
    const s = stateWith(null)
    expect(rightDrawerOpen(s, [], dismissalFor(s))).toBe(false)
  })
})
