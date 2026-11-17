import { describe, it, expect } from 'vitest'
import {
  CHAT_MAX_ASSISTANT_CHARS,
  CHAT_MAX_CHANGES,
  CHAT_MAX_MESSAGES,
  CHAT_MAX_TURNS,
  CHAT_MAX_USER_CHARS,
  ChatRequestSchema,
} from './chat.schema'

const user = (text: string) => ({ role: 'user', text })
const assistant = (text: string) => ({ role: 'assistant', text })
const vacate = { kind: 'vacate', leaseId: 'l1', on: '2026-12-01' }

const base = {
  buildingId: 'odt',
  today: '2026-11-17',
  asOf: '2026-11-17',
  changes: [],
  messages: [user('How much is vacant?')],
}
const ok = (body: unknown) => ChatRequestSchema.safeParse(body).success
const withBody = (patch: Record<string, unknown>) => ({ ...base, ...patch })
const alternating = (userTurns: number) =>
  Array.from({ length: userTurns * 2 - 1 }, (_, i) => (i % 2 === 0 ? user('q') : assistant('a')))

describe('ChatRequestSchema', () => {
  it('accepts a minimal valid body and trims user text', () => {
    const r = ChatRequestSchema.safeParse(withBody({ messages: [user('  hello  ')] }))
    expect(r.success).toBe(true)
    expect(r.data?.messages[0]?.text).toBe('hello')
  })

  it('rejects missing fields, null and unknown keys', () => {
    for (const key of Object.keys(base)) {
      expect(ok(Object.fromEntries(Object.entries(base).filter(([k]) => k !== key)))).toBe(false)
    }
    expect(ok(null)).toBe(false)
    expect(ok(withBody({ extra: 1 }))).toBe(false)
  })

  it('rejects empty messages, a trailing assistant message, and foreign roles', () => {
    expect(ok(withBody({ messages: [] }))).toBe(false)
    expect(ok(withBody({ messages: [user('q'), assistant('a')] }))).toBe(false)
    expect(ok(withBody({ messages: [{ role: 'system', text: 'x' }, user('q')] }))).toBe(false)
    expect(ok(withBody({ messages: [{ role: 'tool', text: 'x' }, user('q')] }))).toBe(false)
  })

  it('rejects messages carrying parts or an id', () => {
    expect(ok(withBody({ messages: [{ ...user('q'), parts: [] }] }))).toBe(false)
    expect(ok(withBody({ messages: [{ ...user('q'), id: 'm1' }] }))).toBe(false)
  })

  it('bounds user and assistant text', () => {
    expect(ok(withBody({ messages: [user('x'.repeat(CHAT_MAX_USER_CHARS))] }))).toBe(true)
    expect(ok(withBody({ messages: [user('x'.repeat(CHAT_MAX_USER_CHARS + 1))] }))).toBe(false)
    expect(ok(withBody({ messages: [user('   ')] }))).toBe(false)
    const a = (n: number) => [user('q'), assistant('x'.repeat(n)), user('q2')]
    expect(ok(withBody({ messages: a(CHAT_MAX_ASSISTANT_CHARS) }))).toBe(true)
    expect(ok(withBody({ messages: a(CHAT_MAX_ASSISTANT_CHARS + 1) }))).toBe(false)
  })

  it('bounds the message and user-turn counts', () => {
    const msgs = (n: number) => [...Array.from({ length: n - CHAT_MAX_TURNS }, () => assistant('a')), ...Array.from({ length: CHAT_MAX_TURNS }, () => user('q'))]
    expect(CHAT_MAX_MESSAGES).toBe(20)
    expect(ok(withBody({ messages: msgs(20) }))).toBe(true)
    expect(ok(withBody({ messages: msgs(21) }))).toBe(false)
    expect(ok(withBody({ messages: alternating(CHAT_MAX_TURNS) }))).toBe(true)
    expect(ok(withBody({ messages: alternating(CHAT_MAX_TURNS + 1) }))).toBe(false)
  })

  it('bounds the number of changes and validates each', () => {
    expect(ok(withBody({ changes: Array.from({ length: CHAT_MAX_CHANGES }, () => vacate) }))).toBe(true)
    expect(ok(withBody({ changes: Array.from({ length: CHAT_MAX_CHANGES + 1 }, () => vacate) }))).toBe(false)
    expect(ok(withBody({ changes: [{ kind: 'vacate', leaseId: 'l1' }] }))).toBe(false)
  })

  it('validates dates and asOf >= today', () => {
    expect(ok(withBody({ asOf: '2026-11-16' }))).toBe(false)
    expect(ok(withBody({ asOf: '2027-01-01' }))).toBe(true)
    expect(ok(withBody({ today: '2026-13-01' }))).toBe(false)
    expect(ok(withBody({ asOf: 'tomorrow' }))).toBe(false)
  })

  it('bounds buildingId to 1..120 chars', () => {
    expect(ok(withBody({ buildingId: '' }))).toBe(false)
    expect(ok(withBody({ buildingId: 'x'.repeat(121) }))).toBe(false)
    expect(ok(withBody({ buildingId: 'x'.repeat(120) }))).toBe(true)
  })
})
