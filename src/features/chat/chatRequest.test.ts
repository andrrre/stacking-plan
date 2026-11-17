import { describe, it, expect, vi } from 'vitest'
import type { UIMessage } from 'ai'
import { ChatRequestSchema, CHAT_MAX_ASSISTANT_CHARS, CHAT_MAX_MESSAGES } from '../../shared/chat.schema'
import { chatFetch, toChatRequest, turnsUsed, type ChatSnapshot } from './chatRequest'

const SNAPSHOT: ChatSnapshot = { buildingId: 'odt', today: '2026-11-15', asOf: '2026-11-15', changes: [] }

const user = (id: string, text: string): UIMessage => ({ id, role: 'user', parts: [{ type: 'text', text }] })
const assistant = (id: string, parts: UIMessage['parts']): UIMessage => ({ id, role: 'assistant', parts })

describe('toChatRequest', () => {
  it('carries the snapshot and the messages as role + text', () => {
    const body = toChatRequest(SNAPSHOT, [user('u1', 'What is vacant today?')])
    expect(body).toEqual({ ...SNAPSHOT, messages: [{ role: 'user', text: 'What is vacant today?' }] })
    expect(ChatRequestSchema.safeParse(body).success).toBe(true)
  })

  it('joins text parts and drops tool, reasoning and step parts', () => {
    const answer = assistant('a1', [
      { type: 'step-start' },
      { type: 'reasoning', text: 'secret thoughts' },
      { type: 'tool-building_overview', toolCallId: 'c1', state: 'output-available', input: {}, output: { vacantSf: 1 } },
      { type: 'text', text: 'Vacant is 38,150 SF.' },
      { type: 'step-start' },
      { type: 'text', text: 'That is on 15 Nov 2026.' },
    ] as UIMessage['parts'])
    const body = toChatRequest(SNAPSHOT, [user('u1', 'Vacant?'), answer, user('u2', 'And next year?')])
    expect(body.messages[1]).toEqual({ role: 'assistant', text: 'Vacant is 38,150 SF.\nThat is on 15 Nov 2026.' })
    expect(JSON.stringify(body)).not.toContain('secret')
    expect(JSON.stringify(body)).not.toContain('toolCallId')
    expect(ChatRequestSchema.safeParse(body).success).toBe(true)
  })

  it('drops messages with no text', () => {
    const empty = assistant('a1', [{ type: 'step-start' }])
    const blank = assistant('a2', [{ type: 'text', text: '   ' }])
    const body = toChatRequest(SNAPSHOT, [user('u1', 'One'), empty, blank, user('u2', 'Two')])
    expect(body.messages).toEqual([{ role: 'user', text: 'One' }, { role: 'user', text: 'Two' }])
  })

  it('cuts assistant text at the assistant limit', () => {
    const long = assistant('a1', [{ type: 'text', text: 'x'.repeat(CHAT_MAX_ASSISTANT_CHARS + 50) }])
    const body = toChatRequest(SNAPSHOT, [user('u1', 'One'), long, user('u2', 'Two')])
    expect(body.messages[1]?.text).toHaveLength(CHAT_MAX_ASSISTANT_CHARS)
    expect(ChatRequestSchema.safeParse(body).success).toBe(true)
  })

  it('keeps only the newest messages and still ends with the user message', () => {
    const history = Array.from({ length: 12 }, (_, i) => [
      user(`u${i}`, `Question ${i}`),
      assistant(`a${i}`, [{ type: 'text', text: `Answer ${i}` }]),
    ]).flat()
    const body = toChatRequest(SNAPSHOT, [...history.slice(-21), user('last', 'Last question')])
    expect(body.messages).toHaveLength(CHAT_MAX_MESSAGES)
    expect(body.messages[CHAT_MAX_MESSAGES - 1]).toEqual({ role: 'user', text: 'Last question' })
    expect(body.messages[0]).toEqual({ role: 'assistant', text: 'Answer 2' })
  })

  it('passes the request schema with what-if changes and a later as-of date', () => {
    const snapshot: ChatSnapshot = {
      ...SNAPSHOT, asOf: '2027-05-15', changes: [{ kind: 'vacate', leaseId: 'odt-l-1', on: '2027-01-01' }],
    }
    const body = toChatRequest(snapshot, [user('u1', 'Hello')])
    expect(body.asOf).toBe('2027-05-15')
    expect(body.changes).toEqual(snapshot.changes)
    expect(ChatRequestSchema.safeParse(body).success).toBe(true)
  })
})

describe('turnsUsed', () => {
  it('counts user messages', () => {
    expect(turnsUsed([])).toBe(0)
    expect(turnsUsed([user('u1', 'a'), assistant('a1', [{ type: 'text', text: 'b' }]), user('u2', 'c')])).toBe(2)
  })
})

describe('chatFetch', () => {
  it('throws chat-http-429 on a 429', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ error: 'Too many' }, { status: 429 }))
    await expect(chatFetch('/api/chat', { method: 'POST' }, fetchFn)).rejects.toThrow('chat-http-429')
  })

  it('throws chat-http-<status> on any other failure status', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ error: 'x' }, { status: 502 }))
    await expect(chatFetch('/api/chat', { method: 'POST' }, fetchFn)).rejects.toThrow('chat-http-502')
  })

  it('passes a 200 through with its init and a signal', async () => {
    const ok = new Response('data: {}\n\n', { status: 200 })
    const fetchFn = vi.fn<typeof fetch>(async () => ok)
    const res = await chatFetch('/api/chat', { method: 'POST', body: '{}' }, fetchFn)
    expect(res).toBe(ok)
    const init = fetchFn.mock.calls[0]?.[1]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe('{}')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it("keeps the caller's signal: aborting it aborts the request", async () => {
    const fetchFn = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const caller = new AbortController()
    const pending = chatFetch('/api/chat', { method: 'POST', signal: caller.signal }, fetchFn)
    caller.abort()
    await expect(pending).rejects.toThrow('aborted')
    expect(fetchFn.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })
})
