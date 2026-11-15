import { SummaryCopySchema, type SummaryCopy, type SummaryRequest } from '../../shared/summary.schema'
import { templateSummary } from './templateSummary'

export type SummaryResult = { copy: SummaryCopy; source: 'ai' | 'offline' }

// The server gives up after 8 s, so its own timeout answers first.
const TIMEOUT_MS = 9000

async function fetchCopy(req: SummaryRequest, fetchFn: typeof fetch, signal?: AbortSignal): Promise<SummaryCopy | null> {
  if (signal?.aborted) return null
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, TIMEOUT_MS)
  signal?.addEventListener('abort', abort)
  try {
    const res = await fetchFn('/api/summary', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const body = SummaryCopySchema.safeParse(await res.json())
    return body.success ? body.data : null
  } catch {
    // Network error, timeout or a body that is not JSON: the templated copy stands.
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

/** The intro copy: from /api/summary when it answers well, otherwise the templated copy. Never rejects. `signal` cancels the call. */
export async function summaryService(req: SummaryRequest, fetchFn: typeof fetch = fetch, signal?: AbortSignal): Promise<SummaryResult> {
  const copy = await fetchCopy(req, fetchFn, signal)
  return copy ? { copy, source: 'ai' } : { copy: templateSummary(req), source: 'offline' }
}
