// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { clientIp } from './http.js'
import { allow, RATE_LIMIT_KEYS, rateKey, trackedKeys } from './rateLimit.js'

describe('allow (10 requests / 60 s / IP)', () => {
  it('allows 10 requests and denies the 11th', () => {
    const ip = '203.0.113.1'
    const results = Array.from({ length: 11 }, (_, i) => allow(ip, 1_000 + i))
    expect(results.slice(0, 10).every(Boolean)).toBe(true)
    expect(results[10]).toBe(false)
  })

  it('resets the window after 60 s', () => {
    const ip = '203.0.113.2'
    for (let i = 0; i < 10; i += 1) allow(ip, 5_000)
    expect(allow(ip, 5_000 + 59_999)).toBe(false)
    expect(allow(ip, 5_000 + 60_000)).toBe(true)
  })

  it('counts each IP separately', () => {
    for (let i = 0; i < 10; i += 1) allow('203.0.113.3', 9_000)
    expect(allow('203.0.113.3', 9_000)).toBe(false)
    expect(allow('203.0.113.4', 9_000)).toBe(true)
  })
})

describe('allow: bounded memory and IPv6 /64 keys', () => {
  it('two addresses in one IPv6 /64 share a bucket', () => {
    for (let i = 0; i < 10; i += 1) allow('2001:db8:aa:bb::1', 20_000)
    expect(allow('2001:db8:aa:bb:ffff:1:2:3', 20_000)).toBe(false)
    expect(allow('2001:0db8:00aa:00bb::9', 20_000)).toBe(false)
    expect(allow('2001:db8:aa:bc::1', 20_000)).toBe(true)
  })

  it('an IPv4-mapped IPv6 address is keyed as its IPv4 address', () => {
    for (let i = 0; i < 10; i += 1) allow('192.0.2.200', 30_000)
    expect(allow('::ffff:192.0.2.200', 30_000)).toBe(false)
  })

  it('a full map refuses new keys instead of evicting live windows, and accepts again once the window passes', () => {
    const t0 = 1_000_000 // well after the earlier tests' windows, so they are pruned first
    const spent = '203.0.113.250'
    for (let i = 0; i < 10; i += 1) allow(spent, t0)
    expect(allow(spent, t0)).toBe(false)
    for (let i = 0; trackedKeys() < RATE_LIMIT_KEYS; i += 1) {
      expect(allow(`10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`, t0 + 1)).toBe(true)
    }
    expect(trackedKeys()).toBe(RATE_LIMIT_KEYS)
    for (let i = 0; i < 100; i += 1) expect(allow(`172.16.${(i >> 8) & 255}.${i & 255}`, t0 + 2)).toBe(false)
    expect(trackedKeys()).toBe(RATE_LIMIT_KEYS)
    expect(allow(spent, t0 + 3)).toBe(false)
    expect(allow('10.0.0.0', t0 + 3)).toBe(true) // an existing key keeps its own window
    expect(allow(spent, t0 + 60_000)).toBe(true)
    expect(allow('172.16.0.0', t0 + 60_001)).toBe(true)
    expect(trackedKeys()).toBeLessThanOrEqual(RATE_LIMIT_KEYS)
  })
})

describe('rateKey', () => {
  it('truncates a 500-character header value to a 64-character key', () => {
    const value = 'a'.repeat(500)
    const ip = clientIp(new Request('http://localhost/api/ask', { headers: { 'x-vercel-forwarded-for': value } }))
    expect(rateKey(ip)).toBe('a'.repeat(64))
  })

  it('keeps the IPv6 /64 grouping', () => {
    expect(rateKey('2001:db8:aa:bb:1:2:3:4')).toBe('2001:db8:aa:bb::/64')
  })
})
