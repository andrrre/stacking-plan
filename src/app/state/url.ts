import { z } from 'zod'
import { isoDate } from '../../shared/isoDate'
import { BUNDLED_BUILDINGS } from '../../data'
import { MAX_RENT_PSF, MAX_REQ_SF, MIN_RENT_PSF, MIN_REQ_SF } from '../../domain/constants'
import { snapToSlider } from '../../domain/dates'
import type { ISODate } from '../../domain/types'
import { FILL_KEYS, legendKeys, type FillKey } from './legendKeys'
import type { AppState, ColourMode, RequirementDraft, ViewMode } from './types'

// spec-technical §3.5. Every parameter is validated on its own; an invalid one is ignored silently.

const MANAGED = ['today', 'b', 'asOf', 'mode', 'view', 'min', 'max', 'rent', 'pot', 'floor', 'legend'] as const

const intParam = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(MIN_REQ_SF).max(MAX_REQ_SF))
const rentParam = z.string().regex(/^\d+(\.\d+)?$/).transform(Number).pipe(z.number().min(MIN_RENT_PSF).max(MAX_RENT_PSF))
const modeParam = z.enum(['availability', 'risk'])
const viewParam = z.enum(['stack', '3d'])
const potParam = z.enum(['0', '1'])
const floorParam = z.string().regex(/^-?\d{1,4}$/).transform(Number).pipe(z.number().int())
const legendParam = z.enum(FILL_KEYS)

export type UrlContext = { today: ISODate; buildingIds: readonly string[] }
export type UrlPatch = {
  buildingId?: string
  asOf?: ISODate
  mode?: ColourMode
  view?: ViewMode
  req?: Partial<RequirementDraft>
  floor?: number // a whole number only; whether the building has it is checked once the building is known
  legend?: FillKey // a pill of the colour mode's legend
}

/** The value of `name` if `schema` accepts it, else undefined. */
function read<T>(params: URLSearchParams, name: string, schema: z.ZodType<T>): T | undefined {
  const raw = params.get(name)
  if (raw === null) return undefined
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : undefined
}

function readRequirement(params: URLSearchParams): Partial<RequirementDraft> {
  const minSf = read(params, 'min', intParam)
  const rawMax = read(params, 'max', intParam)
  const maxSf = rawMax !== undefined && minSf !== undefined && rawMax < minSf ? undefined : rawMax
  const maxRentPsf = read(params, 'rent', rentParam)
  const pot = read(params, 'pot', potParam)
  return {
    ...(minSf !== undefined && { minSf }),
    ...(maxSf !== undefined && { maxSf }),
    ...(maxRentPsf !== undefined && { maxRentPsf }),
    ...(pot !== undefined && { includePotential: pot === '1' }),
  }
}

/** Valid parameters only; `asOf` is snapped to a slider step, `b` must be a known building id. */
export function parseUrlState(search: string, ctx: UrlContext): UrlPatch {
  const params = new URLSearchParams(search)
  const b = read(params, 'b', z.string().min(1))
  const asOf = read(params, 'asOf', isoDate)
  const mode = read(params, 'mode', modeParam)
  const view = read(params, 'view', viewParam)
  const req = readRequirement(params)
  const floor = read(params, 'floor', floorParam)
  const legend = read(params, 'legend', legendParam)
  return {
    ...(b !== undefined && ctx.buildingIds.includes(b) && { buildingId: b }),
    ...(asOf !== undefined && { asOf: snapToSlider(asOf, ctx.today) }),
    ...(mode !== undefined && { mode }),
    ...(view !== undefined && { view }),
    ...(Object.keys(req).length > 0 && { req }),
    ...(floor !== undefined && { floor }),
    ...(legend !== undefined && legendKeys(mode ?? 'availability').includes(legend) && { legend }),
  }
}

/** The query string (with leading '?', or '') for `state`. `currentSearch` supplies unrelated parameters to keep. */
export function serializeUrl(state: AppState, currentSearch: string, includeToday: boolean): string {
  const params = new URLSearchParams(currentSearch)
  for (const key of MANAGED) params.delete(key)
  const { req } = state
  const entries: [string, string | null][] = [
    ['today', includeToday ? state.today : null],
    ['b', state.buildingId === BUNDLED_BUILDINGS[0].id ? null : state.buildingId],
    ['asOf', state.asOf === state.today ? null : state.asOf],
    ['mode', state.mode === 'availability' ? null : state.mode],
    ['view', state.view === '3d' ? null : state.view],
    ['min', req.minSf === null ? null : String(req.minSf)],
    ['max', req.maxSf === null ? null : String(req.maxSf)],
    ['rent', req.maxRentPsf === null ? null : String(req.maxRentPsf)],
    ['pot', req.includePotential ? null : '0'],
    ['floor', state.floor === null || state.view !== '3d' ? null : String(state.floor)], // floor view is a 3D view
    ['legend', state.legend],
  ]
  for (const [key, value] of entries) if (value !== null) params.set(key, value)
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}
