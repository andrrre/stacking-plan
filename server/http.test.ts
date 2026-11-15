// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { clientIp } from './http.js'

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
