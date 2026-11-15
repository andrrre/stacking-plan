import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SummaryRequest } from '../../shared/summary.schema'
import { summaryService } from './summaryService'
import { templateSummary } from './templateSummary'

type FetchFn = typeof fetch

const REQ: SummaryRequest = {
  buildingName: 'Ocean Drive Tower',
  asOf: '2026-11-15',
  options: [{ label: 'Suite 500', floor: 5, suiteNumbers: ['500'], totalSf: 10500, blendedRentPsf: 52, availableFrom: '2026-11-15', notes: [] }],
}
const FALLBACK = { copy: templateSummary(REQ), source: 'offline' }
const AI = { headline: 'A suite on floor 5', paragraph: 'Written by the model.' }

const respond = (body: unknown, status = 200): FetchFn => vi.fn<FetchFn>(async () => Response.json(body, { status }))

describe('summaryService', () => {
  afterEach(() => vi.useRealTimers())

  it('returns the server copy with source "ai"', async () => {
    await expect(summaryService(REQ, respond(AI))).resolves.toEqual({ copy: AI, source: 'ai' })
  })

  it('POSTs the request as JSON to /api/summary', async () => {
    const fetchFn = respond(AI)
    await summaryService(REQ, fetchFn)
    const [url, init] = vi.mocked(fetchFn).mock.calls[0] ?? []
    expect(url).toBe('/api/summary')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toEqual(REQ)
  })

  it.each([400, 403, 429, 502, 503, 504])('falls back to the template on HTTP %i', async (status) => {
    await expect(summaryService(REQ, respond({ error: 'x' }, status))).resolves.toEqual(FALLBACK)
  })

  it('falls back when fetch throws', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => { throw new TypeError('Failed to fetch') })
    await expect(summaryService(REQ, fetchFn)).resolves.toEqual(FALLBACK)
  })

  it.each([
    ['a headline over 90 characters', { headline: 'x'.repeat(91), paragraph: 'ok' }],
    ['an empty paragraph', { headline: 'ok', paragraph: '' }],
    ['a missing field', { headline: 'ok' }],
    ['a non-object body', 'hello'],
  ])('falls back on %s', async (_name, body) => {
    await expect(summaryService(REQ, respond(body))).resolves.toEqual(FALLBACK)
  })

  it('falls back on a non-JSON body', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => new Response('<html>', { status: 200 }))
    await expect(summaryService(REQ, fetchFn)).resolves.toEqual(FALLBACK)
  })

  it('falls back after 9 seconds when the server never answers', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn<FetchFn>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const pending = summaryService(REQ, fetchFn)
    await vi.advanceTimersByTimeAsync(9000)
    await expect(pending).resolves.toEqual(FALLBACK)
  })

  it('aborts the fetch when the caller\'s signal aborts, and falls back', async () => {
    const fetchFn = vi.fn<FetchFn>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const caller = new AbortController()
    const pending = summaryService(REQ, fetchFn, caller.signal)
    caller.abort()
    await expect(pending).resolves.toEqual(FALLBACK)
    expect(vi.mocked(fetchFn).mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  it('does not fetch when the caller\'s signal is already aborted', async () => {
    const fetchFn = respond(AI)
    const caller = new AbortController()
    caller.abort()
    await expect(summaryService(REQ, fetchFn, caller.signal)).resolves.toEqual(FALLBACK)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
