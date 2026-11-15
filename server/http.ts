// Response helpers shared by the API handlers. Error bodies carry generic text only.

const MESSAGES: Record<number, string> = {
  400: 'Bad request',
  403: 'Forbidden',
  413: 'Request too large',
  415: 'Unsupported media type',
  429: 'Too many requests',
  502: 'AI parsing failed',
  503: 'AI parsing is not available',
  504: 'AI parsing timed out',
}

export function jsonError(status: number): Response {
  return Response.json({ error: MESSAGES[status] ?? 'Request failed' }, { status })
}

/**
 * The caller's IP from the platform's forwarding headers, or 'unknown'.
 * Trusted-proxy assumption: on Vercel the platform overwrites these headers. Behind any other proxy, or with none,
 * the caller controls them, so the rate limit is best-effort; real spend control is a provider-side budget cap.
 */
export function clientIp(request: Request): string {
  const first = (name: string) => request.headers.get(name)?.split(',')[0]?.trim()
  return first('x-vercel-forwarded-for') || first('x-forwarded-for') || first('x-real-ip') || 'unknown'
}

function isTimeout(error: unknown): boolean {
  const names = ['AbortError', 'TimeoutError']
  const name = error instanceof Error ? error.name : undefined
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.name : undefined
  return names.includes(name ?? '') || names.includes(cause ?? '')
}

export type AiResult<T> = { ok: true; value: T } | { ok: false; response: Response }

/** Runs a model call; a timeout or abort maps to 504, any other error to 502. */
export async function runAi<T>(fn: () => Promise<T>): Promise<AiResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (error) {
    return { ok: false, response: jsonError(isTimeout(error) ? 504 : 502) }
  }
}
