// Response helpers shared by the API handlers. Error bodies carry generic text only.

const MESSAGES: Record<number, string> = {
  400: 'Bad request',
  403: 'Forbidden',
  413: 'Request too large',
  415: 'Unsupported media type',
  429: 'Too many requests',
  502: 'AI request failed',
  503: 'AI unavailable',
  504: 'AI request timed out',
}

export function jsonError(status: number): Response {
  return Response.json({ error: MESSAGES[status] ?? 'Request failed' }, { status })
}

/**
 * The caller's IP from the platform's forwarding headers, or 'unknown'. Order: x-vercel-forwarded-for, then x-real-ip,
 * then the first x-forwarded-for entry only as a last resort (its first entry is the one a client can prepend).
 * Trusted-proxy assumption: on Vercel the platform overwrites these headers. Behind any other proxy, or with none,
 * the caller controls them, so the rate limit is best-effort; real spend control is a provider-side budget cap.
 * /api/summary and /api/chat deploy as separate functions, so each route has its own in-memory budget per
 * instance.
 */
export function clientIp(request: Request): string {
  const first = (name: string) => request.headers.get(name)?.split(',')[0]?.trim()
  return first('x-vercel-forwarded-for') || first('x-real-ip') || first('x-forwarded-for') || 'unknown'
}

function isTimeout(error: unknown): boolean {
  const names = ['AbortError', 'TimeoutError']
  const name = error instanceof Error ? error.name : undefined
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.name : undefined
  return names.includes(name ?? '') || names.includes(cause ?? '')
}

export type BodyResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413 }

/**
 * The parsed JSON body, read as a stream so that reading stops (413) as soon as it passes `maxBytes`, whatever
 * content-length claimed. 400 for a missing or unreadable body, invalid UTF-8, or text that is not JSON.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<BodyResult> {
  if (request.body === null) return { ok: false, status: 400 }
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let text = ''
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      size += chunk.value.byteLength
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, status: 413 }
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
    return { ok: true, value: JSON.parse(text + decoder.decode()) as unknown }
  } catch {
    // An unreadable stream, invalid UTF-8, or text that is not JSON.
    return { ok: false, status: 400 }
  }
}

/** `sec-fetch-site` values a browser sends for the app's own requests (`none`: typed or opened by the user). */
const OWN_SITE = new Set(['same-origin', 'none'])

/**
 * Status for a request refused before its body is read, or null. A browser marks every fetch with `sec-fetch-site`;
 * anything but this origin (cross-site, or a sibling subdomain as same-site) is 403. Without the header (curl, other
 * non-browser clients) the request passes and the rate limit bounds it. A cross-site no-cors POST arrives as
 * text/plain with no preflight, so only JSON is accepted as well: nobody else's page can spend model calls.
 */
export function refusal(request: Request, maxBytes: number): number | null {
  const site = request.headers.get('sec-fetch-site')
  if (site !== null && !OWN_SITE.has(site)) return 403
  const type = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!type.startsWith('application/json')) return 415
  return Number(request.headers.get('content-length') ?? 0) > maxBytes ? 413 : null
}

export type AiResult<T> = { ok: true; value: T } | { ok: false; response: Response }

/** Runs a model call; a timeout or abort maps to 504, any other error to 502. `onError` sees the error first (logging). */
export async function runAi<T>(fn: () => Promise<T>, onError?: (error: unknown) => void): Promise<AiResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (error) {
    onError?.(error)
    return { ok: false, response: jsonError(isTimeout(error) ? 504 : 502) }
  }
}
