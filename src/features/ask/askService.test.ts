import { describe, it, expect, vi, afterEach } from 'vitest'
import { askService } from './askService'

const TODAY = '2026-11-15'
const LAW_FIRM = 'Law firm, roughly 9–11k SF, moving in by Q2 next year, under $60'
const OFFLINE = { minSf: 9000, maxSf: 11000, maxRentPsf: 60, moveInBy: '2027-06-30' }

type FetchFn = typeof fetch

const respond = (body: unknown, status = 200): FetchFn => vi.fn<FetchFn>(async () => Response.json(body, { status }))

describe('askService', () => {
  afterEach(() => vi.useRealTimers())

  it('returns the server fields with source "ai"', async () => {
    const fetchFn = respond({ minSf: 9500 })
    await expect(askService(LAW_FIRM, TODAY, fetchFn)).resolves.toEqual({ parsed: { minSf: 9500 }, source: 'ai' })
  })

  it('POSTs the query and today as JSON to /api/ask', async () => {
    const fetchFn = respond({ minSf: 1 })
    await askService(LAW_FIRM, TODAY, fetchFn)
    const [url, init] = vi.mocked(fetchFn).mock.calls[0] ?? []
    expect(url).toBe('/api/ask')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toEqual({ query: LAW_FIRM, today: TODAY })
  })

  it('sends at most 500 characters', async () => {
    const fetchFn = respond({ minSf: 1 })
    await askService('x'.repeat(600), TODAY, fetchFn)
    const init = vi.mocked(fetchFn).mock.calls[0]?.[1]
    expect((JSON.parse(String(init?.body)) as { query: string }).query).toHaveLength(500)
  })

  it.each([400, 429, 502, 503, 504])('falls back offline on HTTP %i', async (status) => {
    const result = await askService(LAW_FIRM, TODAY, respond({ error: 'x' }, status))
    expect(result).toEqual({ parsed: OFFLINE, source: 'offline' })
  })

  it('falls back offline when fetch throws', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(askService(LAW_FIRM, TODAY, fetchFn)).resolves.toEqual({ parsed: OFFLINE, source: 'offline' })
  })

  it.each([
    ['a schema-invalid body', { minSf: -1 }],
    ['max below min', { minSf: 12000, maxSf: 9000 }],
    ['a non-object body', 'hello'],
  ])('falls back offline on %s', async (_name, body) => {
    await expect(askService(LAW_FIRM, TODAY, respond(body))).resolves.toEqual({ parsed: OFFLINE, source: 'offline' })
  })

  it('falls back offline on a non-JSON body', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => new Response('<html>', { status: 200 }))
    await expect(askService(LAW_FIRM, TODAY, fetchFn)).resolves.toEqual({ parsed: OFFLINE, source: 'offline' })
  })

  it('falls back offline after a 9 s timeout', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn<FetchFn>((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const pending = askService(LAW_FIRM, TODAY, fetchFn)
    await vi.advanceTimersByTimeAsync(8_999)
    expect(init(fetchFn).signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toEqual({ parsed: OFFLINE, source: 'offline' })
  })

  it('uses the offline parser when the AI returns no fields at all', async () => {
    await expect(askService(LAW_FIRM, TODAY, respond({}))).resolves.toEqual({ parsed: OFFLINE, source: 'offline' })
  })

  it('keeps an AI result that has some fields', async () => {
    await expect(askService(LAW_FIRM, TODAY, respond({ maxRentPsf: 60 }))).resolves.toEqual({ parsed: { maxRentPsf: 60 }, source: 'ai' })
  })

  it('clamps a past AI moveInBy to today', async () => {
    const result = await askService('10k by March', TODAY, respond({ minSf: 10000, moveInBy: '2026-03-31' }))
    expect(result).toEqual({ parsed: { minSf: 10000, moveInBy: TODAY }, source: 'ai' })
  })

  it('does not call the server for empty text', async () => {
    const fetchFn = respond({})
    await expect(askService('   ', TODAY, fetchFn)).resolves.toEqual({ parsed: {}, source: 'offline' })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

function init(fetchFn: FetchFn): RequestInit {
  return vi.mocked(fetchFn).mock.calls[0]?.[1] ?? {}
}
