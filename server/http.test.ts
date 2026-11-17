// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { clientIp, jsonError, readJsonBody, refusal, runAi } from './http.js'

const req = (headers: Record<string, string>) => new Request('http://localhost/api/ask', { headers })

describe('clientIp', () => {
  it('prefers x-vercel-forwarded-for', () => {
    expect(clientIp(req({ 'x-vercel-forwarded-for': '203.0.113.9', 'x-forwarded-for': '198.51.100.1', 'x-real-ip': '192.0.2.1' }))).toBe('203.0.113.9')
  })

  it('then x-real-ip, ahead of x-forwarded-for', () => {
    expect(clientIp(req({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1', 'x-real-ip': '192.0.2.1' }))).toBe('192.0.2.1')
  })

  it('then the first x-forwarded-for entry as a last resort, then "unknown"', () => {
    expect(clientIp(req({ 'x-forwarded-for': ' 198.51.100.1 , 10.0.0.1' }))).toBe('198.51.100.1')
    expect(clientIp(req({}))).toBe('unknown')
  })
})

const post = (headers: Record<string, string>, body = '{"a":1}') => new Request('http://localhost/x', { method: 'POST', headers, body })

describe('refusal', () => {
  it('403 cross-site, checked before the content type', () => {
    expect(refusal(post({ 'sec-fetch-site': 'cross-site', 'content-type': 'text/plain' }), 100)).toBe(403)
  })
  it.each(['cross-site', 'same-site', 'something-else'])('403 for sec-fetch-site %s', (site) => {
    expect(refusal(post({ 'sec-fetch-site': site, 'content-type': 'application/json' }), 100)).toBe(403)
  })
  it.each(['same-origin', 'none'])('passes sec-fetch-site %s', (site) => {
    expect(refusal(post({ 'sec-fetch-site': site, 'content-type': 'application/json' }), 100)).toBeNull()
  })
  it('passes a request without sec-fetch-site (a non-browser client)', () => {
    expect(refusal(post({ 'content-type': 'application/json' }), 100)).toBeNull()
  })
  it('415 unless application/json', () => {
    expect(refusal(post({ 'content-type': 'text/plain' }), 100)).toBe(415)
    expect(refusal(post({}), 100)).toBe(415)
  })
  it('413 when content-length is over the cap', () => {
    expect(refusal(post({ 'content-type': 'application/json', 'content-length': '101' }), 100)).toBe(413)
  })
  it('null for JSON within the cap, charset allowed', () => {
    expect(refusal(post({ 'content-type': 'application/json; charset=utf-8', 'content-length': '100' }), 100)).toBeNull()
  })
})

/** A body of `chunks` chunks of `size` bytes each, recording how many were pulled and whether the reader cancelled. */
function countingStream(chunks: number, size: number) {
  const seen = { pulled: 0, cancelled: false }
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (seen.pulled === chunks) return controller.close()
      seen.pulled += 1
      controller.enqueue(new TextEncoder().encode(' '.repeat(size)))
    },
    cancel() {
      seen.cancelled = true
    },
  })
  return { stream, seen }
}

const streamed = (stream: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) =>
  new Request('http://localhost/x', { method: 'POST', headers, body: stream, duplex: 'half' } as RequestInit)

describe('readJsonBody', () => {
  it('parses JSON within the cap', async () => {
    expect(await readJsonBody(post({}), 100)).toEqual({ ok: true, value: { a: 1 } })
  })

  it('parses a multi-byte UTF-8 body split across chunks', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ q: 'Zürich €' }))
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const b of bytes) controller.enqueue(Uint8Array.of(b))
        controller.close()
      },
    })
    expect(await readJsonBody(streamed(stream), 100)).toEqual({ ok: true, value: { q: 'Zürich €' } })
  })

  it('413 when the body is over the cap in bytes', async () => {
    expect(await readJsonBody(post({}, ' '.repeat(101) + '{}'), 100)).toEqual({ ok: false, status: 413 })
    expect(await readJsonBody(post({}, `"${'é'.repeat(50)}"`), 100)).toEqual({ ok: false, status: 413 })
  })

  it.each([['missing', {}], ['too small', { 'content-length': '10' }]])(
    '413 for a large streamed body with content-length %s, cancelling the reader without buffering it all',
    async (_name, headers: Record<string, string>) => {
      const { stream, seen } = countingStream(1000, 1000)
      expect(await readJsonBody(streamed(stream, headers), 4000)).toEqual({ ok: false, status: 413 })
      expect(seen.cancelled).toBe(true)
      expect(seen.pulled).toBeLessThan(10)
    },
  )

  it('400 when not JSON, not valid UTF-8, missing, or unreadable', async () => {
    expect(await readJsonBody(post({}, '{nope'), 100)).toEqual({ ok: false, status: 400 })
    const invalidUtf8 = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.of(0x22, 0xff, 0xfe, 0x22))
        controller.close()
      },
    })
    expect(await readJsonBody(streamed(invalidUtf8), 100)).toEqual({ ok: false, status: 400 })
    const truncatedUtf8 = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.of(0x22, 0xc3))
        controller.close()
      },
    })
    expect(await readJsonBody(streamed(truncatedUtf8), 100)).toEqual({ ok: false, status: 400 })
    expect(await readJsonBody(new Request('http://localhost/x', { method: 'POST' }), 100)).toEqual({ ok: false, status: 400 })
    const broken = new ReadableStream<Uint8Array>({ pull: (controller) => controller.error(new TypeError('stream errored')) })
    expect(await readJsonBody(streamed(broken), 100)).toEqual({ ok: false, status: 400 })
  })
})

describe('jsonError', () => {
  it.each([[502, 'AI request failed'], [503, 'AI unavailable'], [504, 'AI request timed out']])('%i says %j', async (status, text) => {
    expect(await jsonError(status).json()).toEqual({ error: text })
  })
})

describe('runAi', () => {
  it('returns the value and does not call the log callback on success', async () => {
    const onError = vi.fn()
    expect(await runAi(async () => 42, onError)).toEqual({ ok: true, value: 42 })
    expect(onError).not.toHaveBeenCalled()
  })

  it('calls the log callback with the error and still maps a provider error to 502', async () => {
    const onError = vi.fn()
    const error = new Error('provider said no')
    const result = await runAi(() => Promise.reject(error), onError)
    expect(onError).toHaveBeenCalledExactlyOnceWith(error)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(502)
  })

  it('calls the log callback and still maps a timeout to 504', async () => {
    const onError = vi.fn()
    const error = new DOMException('timed out', 'TimeoutError')
    const result = await runAi(() => Promise.reject(error), onError)
    expect(onError).toHaveBeenCalledExactlyOnceWith(error)
    if (!result.ok) expect(result.response.status).toBe(504)
  })

  it('works without a callback', async () => {
    const result = await runAi(() => Promise.reject(new Error('x')))
    if (!result.ok) expect(result.response.status).toBe(502)
  })
})
