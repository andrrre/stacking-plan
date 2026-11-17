import { formatLongDate, formatMonthYear, formatNumber, formatPsf } from '../../domain/format'
import { parseQuery } from '../../domain/parseQuery'
import type { ISODate, ParsedQuery } from '../../domain/types'
import { ChatRequirementSchema } from '../../shared/chat.schema'

/**
 * A requirement the assistant put into the search form: read by the AI (find_space's input, from the stream) or by
 * the offline parser. `applied` is false when the broker edited the form while the answer was coming, so it was
 * left alone.
 */
export type Fill = { parsed: ParsedQuery; source: 'ai' | 'offline'; applied: boolean }

const EDITED = 'The form was edited while reading, so it was left as you typed it.'

/** A past move-in date means "now" (A9), whichever reader produced it. */
function clampPast(parsed: ParsedQuery, today: ISODate): ParsedQuery {
  return parsed.moveInBy !== undefined && parsed.moveInBy < today ? { ...parsed, moveInBy: today } : parsed
}

/** The stream's requirement data part, parsed; null for anything that fails the schema (it is then ignored). */
export function readRequirement(data: unknown, today: ISODate): ParsedQuery | null {
  const parsed = ChatRequirementSchema.safeParse(data)
  return parsed.success ? clampPast(parsed.data, today) : null
}

/** The offline parser's reading of `text`, or null when it understood nothing. */
export function localFill(text: string, today: ISODate): Fill | null {
  const parsed = parseQuery(text.trim(), today)
  return Object.keys(parsed).length > 0 ? { parsed: clampPast(parsed, today), source: 'offline', applied: true } : null
}

function sizeText({ minSf, maxSf }: ParsedQuery): string | null {
  if (minSf !== undefined && maxSf !== undefined) return `${formatNumber(minSf)}–${formatNumber(maxSf)} SF`
  if (minSf !== undefined) return `at least ${formatNumber(minSf)} SF`
  if (maxSf !== undefined) return `up to ${formatNumber(maxSf)} SF`
  return null
}

/** What was understood, in the words the form and slider use. */
export function understood(p: ParsedQuery): string[] {
  return [
    sizeText(p),
    p.maxRentPsf !== undefined ? `rent up to ${formatPsf(p.maxRentPsf)}/SF` : null,
    p.moveInBy !== undefined ? `move in by ${formatLongDate(p.moveInBy)}` : null,
  ].filter((s): s is string => s !== null)
}

/** Notes under a fill: the form left alone, a size missing, a move-in date past the slider's end. */
export function fillNotes({ parsed: p, applied }: Fill, horizon: ISODate): string[] {
  const size = p.minSf !== undefined ? null
    : p.maxSf !== undefined ? 'Minimum size not understood: enter one below to search.'
      : 'Size not understood: enter a minimum size below to search.'
  const late = p.moveInBy !== undefined && p.moveInBy > horizon
    ? `Move-in date is beyond the 5-year view; showing ${formatMonthYear(horizon)}.`
    : null
  return [applied ? null : EDITED, size, late].filter((s): s is string => s !== null)
}
