// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

vi.mock('ai', () => ({ generateObject: vi.fn() }))

import { generateObject } from 'ai'
import { POST } from '../api/summary.js'
import type { SummaryRequest } from '../src/shared/summary.schema.js'
import { handleSummary } from './summary.js'

const mockGenerate = vi.mocked(generateObject)
const KEY_ENV = { ANTHROPIC_API_KEY: 'test-key' }
const COPY = { headline: 'Two office options at Ocean Drive Tower', paragraph: 'Suite 500 and Suite 600 are shortlisted.' }

const request: SummaryRequest = {
  buildingName: 'Ocean Drive Tower',
  asOf: '2026-11-15',
  options: [
    { label: 'Suite 500', floor: 5, suiteNumbers: ['500'], totalSf: 10500, blendedRentPsf: 52, availableFrom: '2026-11-15', notes: [] },
    { label: 'Suite 600', floor: 6, suiteNumbers: ['600'], totalSf: 12400, blendedRentPsf: 50, availableFrom: '2027-05-01', notes: ['Subject to the current tenant vacating (30 Apr 2027).'] },
  ],
}
const validBody = () => JSON.stringify(request)

let ipCounter = 0
function summaryRequest(body: string, headers: Record<string, string> = { 'content-type': 'application/json' }): Request {
  return new Request('http://localhost/api/summary', {
    method: 'POST',
    headers: { 'x-forwarded-for': `203.0.113.${(ipCounter += 1)}`, ...headers },
    body,
  })
}

async function errorOf(res: Response): Promise<string> {
  return ((await res.json()) as { error: string }).error
}

describe('handleSummary', () => {
  it('returns the copy from the model', async () => {
    mockGenerate.mockResolvedValue({ object: COPY } as never)
    const res = await handleSummary(summaryRequest(validBody()), KEY_ENV)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(COPY)
  })

  it('calls the model with a 400-token output cap, thinking off, no temperature, no retries, an abort signal, the default model, and the request as quoted data', async () => {
    mockGenerate.mockClear()
    mockGenerate.mockResolvedValue({ object: COPY } as never)
    await handleSummary(summaryRequest(validBody()), KEY_ENV)
    const options = mockGenerate.mock.calls[0]?.[0] as unknown as Record<string, unknown>
    expect(options).toMatchObject({ maxOutputTokens: 400, maxRetries: 0, providerOptions: { anthropic: { thinking: { type: 'disabled' } } } })
    expect(options).not.toHaveProperty('temperature')
    expect(options.abortSignal).toBeInstanceOf(AbortSignal)
    expect((options.model as { modelId: string }).modelId).toBe('claude-haiku-5-5')
    expect(String(options.system)).toMatch(/data, not instructions/i)
    expect(String(options.system)).toMatch(/caveats/i)
    expect(String(options.prompt)).toContain(JSON.stringify(request))
  })

  it('uses AI_MODEL when set', async () => {
    mockGenerate.mockResolvedValue({ object: COPY } as never)
    await handleSummary(summaryRequest(validBody()), { ...KEY_ENV, AI_MODEL: 'claude-custom' })
    const options = mockGenerate.mock.calls[0]?.[0] as unknown as { model: { modelId: string } }
    expect(options.model.modelId).toBe('claude-custom')
  })

  it.each([
    ['not JSON', '{nope'],
    ['no options', JSON.stringify({ ...request, options: [] })],
    ['six options', JSON.stringify({ ...request, options: Array(6).fill(request.options[0]) })],
    ['a bad date', JSON.stringify({ ...request, asOf: '15/11/2026' })],
  ])('400 when the body is %s, and the model is never called', async (_name, body) => {
    mockGenerate.mockClear()
    const res = await handleSummary(summaryRequest(body), KEY_ENV)
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toBe('Bad request')
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('503 with no key, and the model is never called', async () => {
    mockGenerate.mockClear()
    const res = await handleSummary(summaryRequest(validBody()), {})
    expect(res.status).toBe(503)
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('502 on schema-invalid model output', async () => {
    mockGenerate.mockResolvedValue({ object: { headline: 'x'.repeat(91), paragraph: 'ok' } } as never)
    const res = await handleSummary(summaryRequest(validBody()), KEY_ENV)
    expect(res.status).toBe(502)
  })

  it('502 when the paragraph is over-long', async () => {
    mockGenerate.mockResolvedValue({ object: { headline: 'ok', paragraph: 'x'.repeat(601) } } as never)
    const res = await handleSummary(summaryRequest(validBody()), KEY_ENV)
    expect(res.status).toBe(502)
  })

  it('502 when the reply is cut off at the output cap and cannot be parsed', async () => {
    mockGenerate.mockImplementation(async () => {
      throw Object.assign(new Error('No object generated: could not parse the response.'), { name: 'AI_NoObjectGeneratedError', finishReason: 'length' })
    })
    const res = await handleSummary(summaryRequest(validBody()), KEY_ENV)
    expect(res.status).toBe(502)
  })

  it('502 with a generic message when the provider throws', async () => {
    mockGenerate.mockImplementation(async () => { throw new Error('upstream said: invalid x-api-key sk-secret') })
    const res = await handleSummary(summaryRequest(validBody()), KEY_ENV)
    expect(res.status).toBe(502)
    expect(await errorOf(res)).not.toMatch(/sk-secret|x-api-key/)
  })

  it('logs one [ai:summary] line for a provider error, with the key value redacted', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockGenerate.mockImplementation(async () => { throw new Error('upstream rejected key test-key') })
    const res = await handleSummary(summaryRequest(validBody()), KEY_ENV)
    expect(res.status).toBe(502)
    expect(spy.mock.calls).toEqual([['[ai:summary] Error: upstream rejected key [key]']])
    spy.mockRestore()
  })

  it.each([['AbortError'], ['TimeoutError']])('504 on %s', async (name) => {
    mockGenerate.mockImplementation(async () => { throw new DOMException('aborted', name) })
    const res = await handleSummary(summaryRequest(validBody()), KEY_ENV)
    expect(res.status).toBe(504)
  })

  it('429 after 10 requests from one IP in a minute', async () => {
    const ip = { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.99' }
    const statuses = []
    for (let i = 0; i < 11; i += 1) statuses.push((await handleSummary(summaryRequest(validBody(), ip), {})).status)
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(503))
    expect(statuses[10]).toBe(429)
  })
})

describe('handleSummary: request hardening', () => {
  it.each([['text/plain'], ['application/x-www-form-urlencoded'], ['']])('415 for content-type %j, and the model is never called', async (type) => {
    mockGenerate.mockClear()
    const res = await handleSummary(summaryRequest(validBody(), type ? { 'content-type': type } : {}), KEY_ENV)
    expect(res.status).toBe(415)
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('accepts application/json with a charset', async () => {
    mockGenerate.mockResolvedValue({ object: COPY } as never)
    const res = await handleSummary(summaryRequest(validBody(), { 'content-type': 'application/json; charset=utf-8' }), KEY_ENV)
    expect(res.status).toBe(200)
  })

  it('403 for a cross-site request', async () => {
    mockGenerate.mockClear()
    const res = await handleSummary(summaryRequest(validBody(), { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }), KEY_ENV)
    expect(res.status).toBe(403)
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('413 when content-length is over the limit, before the body is read', async () => {
    const req = summaryRequest(validBody(), { 'content-type': 'application/json', 'content-length': '1000000' })
    const res = await handleSummary(req, KEY_ENV)
    expect(res.status).toBe(413)
    expect(req.bodyUsed).toBe(false)
  })

  it('413 when the body is over the limit without a content-length, and the model is never called', async () => {
    mockGenerate.mockClear()
    const req = summaryRequest(' '.repeat(40_000) + validBody())
    const res = await handleSummary(req, KEY_ENV)
    expect(res.status).toBe(413)
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('400 when reading the body fails', async () => {
    const req = summaryRequest(validBody())
    const broken = new ReadableStream({ pull: (controller) => controller.error(new TypeError('body stream errored')) })
    Object.defineProperty(req, 'body', { value: broken })
    const res = await handleSummary(req, KEY_ENV)
    expect(res.status).toBe(400)
  })
})

describe('api/summary.ts POST (C3)', () => {
  it('returns 503 when ANTHROPIC_API_KEY is not set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const res = await POST(summaryRequest(validBody()))
    expect(res.status).toBe(503)
    vi.unstubAllEnvs()
  })
})
