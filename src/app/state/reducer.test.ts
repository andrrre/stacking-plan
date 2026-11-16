import { describe, it, expect } from 'vitest'
import { reducer } from './reducer'
import type { Action, AppState } from './types'
import type { Candidate, ShortlistEntry } from '../../domain/types'
import { building } from '../../domain/testing/fixtures'

const TODAY = '2026-11-15'

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}

function makeState(overrides: Partial<AppState> = {}): AppState {
  return deepFreeze({
    today: TODAY,
    buildingId: 'odt',
    asOf: TODAY,
    mode: 'availability',
    view: 'stack',
    req: { minSf: null, maxSf: null, maxRentPsf: null, includePotential: true },
    selection: null,
    highlight: null,
    changes: [],
    shortlist: [],
    importedBuildings: [],
    overlay: 'none',
    floor: null,
    legend: null,
    presenting: false,
    ...overrides,
  })
}

const candidate: Candidate = {
  key: 'odt-500', suiteIds: ['odt-500'], suiteNumbers: ['500'], floor: 5, totalSf: 10250, excessSf: 250,
  blendedRentPsf: 48, availableFrom: TODAY, availability: 'now', caveats: [],
}
const entry = (n: number): ShortlistEntry => ({
  id: `odt|${TODAY}|k${n}|b`, buildingId: 'odt', candidate, asOf: TODAY, whatIf: false,
})

function run(state: AppState, action: Action): AppState {
  const next = reducer(state, action)
  expect(next).not.toBe(state)
  return next
}

describe('reducer', () => {
  it('building/set to the building already shown changes nothing', () => {
    const s = makeState({ selection: { kind: 'suite', suiteId: 'odt-500' }, floor: 5 })
    expect(reducer(s, { type: 'building/set', buildingId: 'odt' })).toBe(s)
  })

  it('building/set switches building and clears selection, highlight and changes', () => {
    const s = makeState({
      selection: { kind: 'suite', suiteId: 'odt-500' }, highlight: 'vacant',
      changes: [{ kind: 'vacate', leaseId: 'odt-600-l1', on: '2027-01-31' }],
      req: { minSf: 10000, maxSf: null, maxRentPsf: null, includePotential: true },
    })
    const next = run(s, { type: 'building/set', buildingId: 'pbp' })
    expect(next.buildingId).toBe('pbp')
    expect(next.selection).toBeNull()
    expect(next.highlight).toBeNull()
    expect(next.changes).toEqual([])
    expect(next.req.minSf).toBe(10000)
  })

  it('asOf/set snaps to a slider step', () => {
    expect(run(makeState(), { type: 'asOf/set', asOf: '2027-06-30' }).asOf).toBe('2027-06-01')
    expect(run(makeState(), { type: 'asOf/set', asOf: '2027-05-01' }).asOf).toBe('2027-05-01')
  })

  it('asOf/set clamps to [today, step 60]', () => {
    expect(run(makeState(), { type: 'asOf/set', asOf: '2025-01-01' }).asOf).toBe(TODAY)
    expect(run(makeState(), { type: 'asOf/set', asOf: '2035-01-01' }).asOf).toBe('2031-11-01')
  })

  it('mode/set and view/set', () => {
    expect(run(makeState(), { type: 'mode/set', mode: 'risk' }).mode).toBe('risk')
    expect(run(makeState(), { type: 'view/set', view: '3d' }).view).toBe('3d')
  })

  it('req/set merges the patch and clears a match selection', () => {
    const s = makeState({ selection: { kind: 'match', key: 'odt-500' } })
    const next = run(s, { type: 'req/set', patch: { minSf: 10000, maxRentPsf: 50 } })
    expect(next.req).toEqual({ minSf: 10000, maxSf: null, maxRentPsf: 50, includePotential: true })
    expect(next.selection).toBeNull()
  })

  it('req/set keeps a suite selection', () => {
    const s = makeState({ selection: { kind: 'suite', suiteId: 'odt-500' } })
    expect(run(s, { type: 'req/set', patch: { includePotential: false } }).selection).toEqual({ kind: 'suite', suiteId: 'odt-500' })
  })

  it('req/clear nulls the sizes and rent and keeps includePotential', () => {
    const s = makeState({ req: { minSf: 9000, maxSf: 11000, maxRentPsf: 60, includePotential: false } })
    expect(run(s, { type: 'req/clear' }).req).toEqual({ minSf: null, maxSf: null, maxRentPsf: null, includePotential: false })
  })

  it('ask/apply replaces the requirement, keeps includePotential, snaps moveInBy and clears selection', () => {
    const s = makeState({
      selection: { kind: 'suite', suiteId: 'odt-500' },
      req: { minSf: 1, maxSf: null, maxRentPsf: 70, includePotential: false },
    })
    const next = run(s, { type: 'ask/apply', parsed: { minSf: 9000, maxSf: 11000, moveInBy: '2027-06-30' } })
    expect(next.req).toEqual({ minSf: 9000, maxSf: 11000, maxRentPsf: null, includePotential: false })
    expect(next.asOf).toBe('2027-06-01')
    expect(next.selection).toBeNull()
  })

  it('ask/apply does not keep a stale max size or rent from an earlier query', () => {
    const first = run(makeState(), { type: 'ask/apply', parsed: { minSf: 9000, maxSf: 11000, maxRentPsf: 60 } })
    const second = run(deepFreeze(first), { type: 'ask/apply', parsed: { minSf: 12000 } })
    expect(second.req).toEqual({ minSf: 12000, maxSf: null, maxRentPsf: null, includePotential: true })
  })

  it('ask/apply with no size found leaves minSf null', () => {
    const s = makeState({ req: { minSf: 10000, maxSf: 20000, maxRentPsf: 50, includePotential: true } })
    expect(run(s, { type: 'ask/apply', parsed: {} }).req).toEqual({ minSf: null, maxSf: null, maxRentPsf: null, includePotential: true })
  })

  it('ask/apply without moveInBy leaves asOf unchanged', () => {
    const s = makeState({ asOf: '2027-05-01' })
    expect(run(s, { type: 'ask/apply', parsed: { minSf: 10000 } }).asOf).toBe('2027-05-01')
  })

  it('noFit/jump sets asOf and switches potential on', () => {
    const s = makeState({ req: { minSf: 12000, maxSf: null, maxRentPsf: null, includePotential: false } })
    const next = run(s, { type: 'noFit/jump', asOf: '2027-05-01' })
    expect(next.asOf).toBe('2027-05-01')
    expect(next.req).toEqual({ minSf: 12000, maxSf: null, maxRentPsf: null, includePotential: true })
  })

  it('select sets the selection', () => {
    expect(run(makeState(), { type: 'select', selection: { kind: 'match', key: 'a+b' } }).selection).toEqual({ kind: 'match', key: 'a+b' })
    expect(run(makeState({ selection: { kind: 'suite', suiteId: 'x' } }), { type: 'select', selection: null }).selection).toBeNull()
  })

  it('highlight/toggle sets, switches and clears', () => {
    const on = run(makeState(), { type: 'highlight/toggle', kpi: 'largestBlock' })
    expect(on.highlight).toBe('largestBlock')
    expect(run(on, { type: 'highlight/toggle', kpi: 'vacant' }).highlight).toBe('vacant')
    expect(run(deepFreeze(on), { type: 'highlight/toggle', kpi: 'largestBlock' }).highlight).toBeNull()
  })

  it('scenario/add appends and scenario/reset clears', () => {
    const added = run(makeState(), { type: 'scenario/add', change: { kind: 'renew', leaseId: 'odt-600-l1', newEnd: '2032-04-30' } })
    expect(added.changes).toEqual([{ kind: 'renew', leaseId: 'odt-600-l1', newEnd: '2032-04-30' }])
    expect(run(deepFreeze(added), { type: 'scenario/reset' }).changes).toEqual([])
  })

  it('shortlist/add appends and dedupes on id', () => {
    const one = run(makeState(), { type: 'shortlist/add', entry: entry(1) })
    expect(one.shortlist).toEqual([entry(1)])
    const again = run(deepFreeze(one), { type: 'shortlist/add', entry: entry(1) })
    expect(again.shortlist).toBe(one.shortlist)
  })

  it('shortlist/add is capped at 10 entries', () => {
    const full = makeState({ shortlist: Array.from({ length: 10 }, (_, i) => entry(i)) })
    const next = run(full, { type: 'shortlist/add', entry: entry(99) })
    expect(next.shortlist).toHaveLength(10)
    expect(next.shortlist).toBe(full.shortlist)
  })

  it('the shortlist cap is per building', () => {
    const odt = Array.from({ length: 10 }, (_, i) => entry(i))
    const full = makeState({ shortlist: odt })
    const pbpEntry: ShortlistEntry = { ...entry(1), id: 'pbp|k1', buildingId: 'pbp' }
    expect(run(full, { type: 'shortlist/add', entry: pbpEntry }).shortlist).toHaveLength(11)
    expect(reducer(full, { type: 'shortlist/add', entry: entry(99) }).shortlist).toBe(full.shortlist)
  })

  it('shortlist/remove removes by id', () => {
    const s = makeState({ shortlist: [entry(1), entry(2)] })
    expect(run(s, { type: 'shortlist/remove', id: entry(1).id }).shortlist).toEqual([entry(2)])
  })

  it('building/import appends and selects the first imported building', () => {
    const a = building({ id: 'csv-a' })
    const b = building({ id: 'csv-b' })
    const s = makeState({
      importedBuildings: [building({ id: 'csv-old' })],
      selection: { kind: 'suite', suiteId: 'odt-500' },
      changes: [{ kind: 'vacate', leaseId: 'odt-600-l1', on: '2027-01-31' }],
    })
    const next = run(s, { type: 'building/import', buildings: [a, b] })
    expect(next.importedBuildings.map((x) => x.id)).toEqual(['csv-old', 'csv-a', 'csv-b'])
    expect(next.buildingId).toBe('csv-a')
    expect(next.selection).toBeNull()
    expect(next.changes).toEqual([])
  })

  it('building/import with no buildings keeps the current building', () => {
    expect(run(makeState(), { type: 'building/import', buildings: [] }).buildingId).toBe('odt')
  })

  describe('building/remove', () => {
    const own = building({ id: 'csv-own' })
    const other = building({ id: 'csv-other' })
    const ownEntry: ShortlistEntry = { ...entry(1), id: 'csv-own|k1', buildingId: 'csv-own' }
    const otherEntry: ShortlistEntry = { ...entry(2), id: 'csv-other|k2', buildingId: 'csv-other' }

    it('removes the selected imported building and its shortlist, switching to the first bundled building', () => {
      const s = makeState({
        buildingId: 'csv-own',
        importedBuildings: [own, other],
        shortlist: [entry(3), ownEntry, otherEntry],
        selection: { kind: 'suite', suiteId: 'csv-own-1' },
        highlight: 'vacant',
        changes: [{ kind: 'vacate', leaseId: 'x', on: '2027-01-31' }],
      })
      const next = run(s, { type: 'building/remove', buildingId: 'csv-own' })
      expect(next.importedBuildings).toEqual([other])
      expect(next.shortlist).toEqual([entry(3), otherEntry])
      expect(next.buildingId).toBe('odt')
      expect(next.selection).toBeNull()
      expect(next.highlight).toBeNull()
      expect(next.changes).toEqual([])
    })

    it('removing a building that is not selected keeps the view as it is', () => {
      const s = makeState({
        buildingId: 'pbp', importedBuildings: [own, other], shortlist: [ownEntry],
        selection: { kind: 'suite', suiteId: 'pbp-701' },
      })
      const next = run(s, { type: 'building/remove', buildingId: 'csv-other' })
      expect(next.importedBuildings).toEqual([own])
      expect(next.shortlist).toEqual([ownEntry])
      expect(next.buildingId).toBe('pbp')
      expect(next.selection).toEqual({ kind: 'suite', suiteId: 'pbp-701' })
    })

    it('a bundled building or an unknown id cannot be removed', () => {
      const s = makeState({ shortlist: [entry(1)], importedBuildings: [own] })
      expect(reducer(s, { type: 'building/remove', buildingId: 'odt' })).toBe(s)
      expect(reducer(s, { type: 'building/remove', buildingId: 'nope' })).toBe(s)
    })
  })

  describe('floor/set', () => {
    it('enters floor view on a floor of the current building, and steps to another', () => {
      const on = run(makeState(), { type: 'floor/set', floor: 7 })
      expect(on.floor).toBe(7)
      expect(run(on, { type: 'floor/set', floor: 6 }).floor).toBe(6)
    })

    it('null leaves floor view', () => {
      expect(run(makeState({ floor: 5 }), { type: 'floor/set', floor: null }).floor).toBeNull()
    })

    it('a floor the current building does not have leaves floor view', () => {
      expect(run(makeState({ floor: 5 }), { type: 'floor/set', floor: 13 }).floor).toBeNull()
      expect(run(makeState({ buildingId: 'pbp', floor: 5 }), { type: 'floor/set', floor: 9 }).floor).toBeNull()
      expect(run(makeState(), { type: 'floor/set', floor: 0 }).floor).toBeNull()
    })

    it('switching, importing or removing the shown building clears it', () => {
      expect(run(makeState({ floor: 5 }), { type: 'building/set', buildingId: 'pbp' }).floor).toBeNull()
      const imported = building({ id: 'csv-x' })
      expect(run(makeState({ floor: 5 }), { type: 'building/import', buildings: [imported] }).floor).toBeNull()
      const held = makeState({ buildingId: 'csv-x', importedBuildings: [imported], floor: 1 })
      expect(run(held, { type: 'building/remove', buildingId: 'csv-x' }).floor).toBeNull()
    })

    it('selecting a suite on another floor moves floor view to that floor', () => {
      expect(run(makeState({ floor: 7 }), { type: 'select', selection: { kind: 'suite', suiteId: 'odt-220' } }).floor).toBe(2)
      expect(run(makeState({ floor: 7 }), { type: 'select', selection: { kind: 'match', key: 'odt-500' } }).floor).toBe(5)
      expect(run(makeState({ floor: 5 }), { type: 'select', selection: { kind: 'match', key: 'odt-700+odt-710' } }).floor).toBe(7)
    })

    it('a selection keeps the floor when it is on it, unknown, cleared, or floor view is off', () => {
      expect(run(makeState({ floor: 5 }), { type: 'select', selection: { kind: 'suite', suiteId: 'odt-510' } }).floor).toBe(5)
      expect(run(makeState({ floor: 5 }), { type: 'select', selection: { kind: 'suite', suiteId: 'nope' } }).floor).toBe(5)
      expect(run(makeState({ floor: 5 }), { type: 'select', selection: null }).floor).toBe(5)
      expect(run(makeState(), { type: 'select', selection: { kind: 'suite', suiteId: 'odt-220' } }).floor).toBeNull()
    })

    it('other actions keep it', () => {
      const s = makeState({ floor: 5 })
      expect(run(s, { type: 'asOf/set', asOf: '2027-05-01' }).floor).toBe(5)
      expect(run(s, { type: 'select', selection: { kind: 'suite', suiteId: 'odt-500' } }).floor).toBe(5)
      expect(run(s, { type: 'req/set', patch: { minSf: 9000 } }).floor).toBe(5)
    })
  })

  it('overlay/set', () => {
    expect(run(makeState(), { type: 'overlay/set', overlay: 'summary' }).overlay).toBe('summary')
  })

  describe('legend/toggle', () => {
    it('sets a key, switches to another and clears on the same key', () => {
      const on = run(makeState(), { type: 'legend/toggle', key: 'vacant' })
      expect(on.legend).toBe('vacant')
      expect(run(on, { type: 'legend/toggle', key: 'expiring' }).legend).toBe('expiring')
      expect(run(on, { type: 'legend/toggle', key: 'vacant' }).legend).toBeNull()
    })

    it('a key the colour mode does not show changes nothing', () => {
      const s = makeState()
      expect(reducer(s, { type: 'legend/toggle', key: 'risk-le6' })).toBe(s)
      expect(run(makeState({ mode: 'risk' }), { type: 'legend/toggle', key: 'risk-le6' }).legend).toBe('risk-le6')
    })

    it('keeps the selection: a filtered-out suite stays selected', () => {
      const s = makeState({ selection: { kind: 'suite', suiteId: 'odt-600' } })
      expect(run(s, { type: 'legend/toggle', key: 'vacant' }).selection).toEqual({ kind: 'suite', suiteId: 'odt-600' })
    })

    it('switching, importing or removing the shown building clears it', () => {
      expect(run(makeState({ legend: 'vacant' }), { type: 'building/set', buildingId: 'pbp' }).legend).toBeNull()
      const imported = building({ id: 'csv-x' })
      expect(run(makeState({ legend: 'vacant' }), { type: 'building/import', buildings: [imported] }).legend).toBeNull()
    })

    it('a colour mode change keeps a key both legends have and clears one the new legend lacks', () => {
      expect(run(makeState({ legend: 'vacant' }), { type: 'mode/set', mode: 'risk' }).legend).toBe('vacant')
      expect(run(makeState({ legend: 'expiring' }), { type: 'mode/set', mode: 'risk' }).legend).toBeNull()
      expect(run(makeState({ mode: 'risk', legend: 'risk-le12' }), { type: 'mode/set', mode: 'availability' }).legend).toBeNull()
    })

    it('other actions keep it', () => {
      const s = makeState({ legend: 'vacant' })
      expect(run(s, { type: 'asOf/set', asOf: '2027-05-01' }).legend).toBe('vacant')
      expect(run(s, { type: 'req/set', patch: { minSf: 9000 } }).legend).toBe('vacant')
      expect(run(s, { type: 'floor/set', floor: 5 }).legend).toBe('vacant')
    })
  })

  it('present/set turns presentation mode on and off', () => {
    const on = run(makeState(), { type: 'present/set', on: true })
    expect(on.presenting).toBe(true)
    expect(run(on, { type: 'present/set', on: false }).presenting).toBe(false)
  })
})
