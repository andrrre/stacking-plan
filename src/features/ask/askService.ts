import { parseQuery } from '../../domain/parseQuery'
import type { ISODate, ParsedQuery } from '../../domain/types'
import { ParsedQuerySchema } from '../../shared/ask.schema'

export type AskResult = { parsed: ParsedQuery; source: 'ai' | 'offline' }

const MAX_CHARS = 500
// The server gives up after 8 s, so its own timeout answers first.
const TIMEOUT_MS = 9000

async function fetchParsed(query: string, today: ISODate, fetchFn: typeof fetch): Promise<ParsedQuery | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetchFn('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, today }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const body = ParsedQuerySchema.safeParse(await res.json())
    return body.success ? body.data : null
  } catch {
    // Network error, timeout or a body that is not JSON: the offline parser answers instead.
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** A past move-in date means "now" (A9), whichever parser read it. */
function clampPast(parsed: ParsedQuery, today: ISODate): ParsedQuery {
  return parsed.moveInBy !== undefined && parsed.moveInBy < today ? { ...parsed, moveInBy: today } : parsed
}

/**
 * Parsed requirement fields: from /api/ask when it answers well, otherwise from the offline parser.
 * An AI answer with no fields at all also falls back, since the offline parser may still read something.
 * With `allowAi` false (an imported building: the broker's own data) nothing is sent; only the offline parser runs.
 */
export async function askService(
  query: string, today: ISODate, fetchFn: typeof fetch = fetch, allowAi = true,
): Promise<AskResult> {
  const text = query.trim().slice(0, MAX_CHARS)
  const parsed = text === '' || !allowAi ? null : await fetchParsed(text, today, fetchFn)
  return parsed && Object.keys(parsed).length > 0
    ? { parsed: clampPast(parsed, today), source: 'ai' }
    : { parsed: parseQuery(text, today), source: 'offline' }
}
