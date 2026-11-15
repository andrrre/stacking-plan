// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { clientIp, jsonError, readJsonBody, refusal } from './http.js'

const req = (headers: Record<string, string>) => new Request('http://localhost/api/ask', { headers })

describe('clientIp', () => {
  it('prefers x-vercel-forwarded-for', () => {
    expect(clientIp(req({ 'x-vercel-forwarded-for': '203.0.113.9', 'x-forwarded-for': '198.51.100.1', 'x-real-ip': '192.0.2.1' }))).toBe('203.0.113.9')
  })

  it('then the first x-forwarded-for entry', () => {
    expect(clientIp(req({ 'x-forwarded-for': ' 198.51.100.1 , 10.0.0.1', 'x-real-ip': '192.0.2.1' }))).toBe('198.51.100.1')
  })

  it('then x-real-ip, then "unknown"', () => {
    expect(clientIp(req({ 'x-real-ip': '192.0.2.1' }))).toBe('192.0.2.1')
    expect(clientIp(req({}))).toBe('unknown')
  })
})

const post = (headers: Record<string, string>, body = '{"a":1}') => new Request('http://localhost/x', { method: 'POST', headers, body })

describe('refusal', () => {
  it('403 cross-site, checked before the content type', () => {
    expect(refusal(post({ 'sec-fetch-site': 'cross-site', 'content-type': 'text/plain' }), 100)).toBe(403)
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

describe('readJsonBody', () => {
  it('parses JSON within the cap', async () => {
    expect(await readJsonBody(post({}), 100)).toEqual({ a: 1 })
  })
  it('undefined when over the cap, not JSON, or unreadable', async () => {
    expect(await readJsonBody(post({}, ' '.repeat(101) + '{}'), 100)).toBeUndefined()
    expect(await readJsonBody(post({}, '{nope'), 100)).toBeUndefined()
    const broken = post({})
    Object.defineProperty(broken, 'text', { value: async () => { throw new TypeError('stream errored') } })
    expect(await readJsonBody(broken, 100)).toBeUndefined()
  })
})

describe('jsonError', () => {
  it.each([[502, 'AI request failed'], [503, 'AI unavailable'], [504, 'AI request timed out']])('%i says %j', async (status, text) => {
    expect(await jsonError(status).json()).toEqual({ error: text })
  })
})
