import { describe, it, expect, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { ChatRequestSchema, CHAT_MAX_TURNS, type ChatRequest } from '../../shared/chat.schema'
import type { ChatSnapshot } from './chatRequest'
import { useBuildingChat, type ChatEffects } from './useBuildingChat'

const SNAPSHOT: ChatSnapshot = { buildingId: 'odt', today: '2026-11-15', asOf: '2026-11-15', changes: [] }

/** A real UI message stream answering `text` in one text part. */
function answer(text: string): Response {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'text-start', id: 't1' })
        writer.write({ type: 'text-delta', id: 't1', delta: text })
        writer.write({ type: 'text-end', id: 't1' })
      },
    }),
  })
}

/**
 * A stream that starts an answer, then ends with the server's fixed in-stream error, as a server timeout or provider
 * failure does: the `start` chunk leaves an empty assistant message for the hook to drop.
 */
function streamError(): Response {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'start' })
        writer.write({ type: 'error', errorText: 'AI request failed' })
      },
    }),
  })
}

/** A real stream with a requirement data part (or any data) before the answer text. */
function answerWithData(data: unknown, text = '500 fits.'): Response {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'data-requirement', data })
        writer.write({ type: 'text-start', id: 't1' })
        writer.write({ type: 'text-delta', id: 't1', delta: text })
        writer.write({ type: 'text-end', id: 't1' })
      },
    }),
  })
}

function effects(applied = true) {
  return {
    onRequirement: vi.fn<ChatEffects['onRequirement']>(() => applied),
    onFailure: vi.fn<ChatEffects['onFailure']>(),
  }
}

const answering = (text = 'Vacant is 38,150 SF on 15 Nov 2026.') => vi.fn<typeof fetch>(async () => answer(text))

const sentBody = (fetchFn: ReturnType<typeof answering>, call: number): ChatRequest =>
  JSON.parse(String(fetchFn.mock.calls[call]?.[1]?.body)) as ChatRequest

function renderChat(fetchFn: typeof fetch, snapshot: ChatSnapshot = SNAPSHOT, fx?: ChatEffects) {
  return renderHook(({ snap }) => useBuildingChat(snap, fetchFn, fx), { initialProps: { snap: snapshot } })
}

async function sendAndSettle(result: { current: ReturnType<typeof useBuildingChat> }, text: string) {
  await act(() => result.current.send(text))
}

describe('useBuildingChat', () => {
  it('posts a body that passes the request schema and holds the current snapshot', async () => {
    const fetchFn = answering()
    const { result } = renderChat(fetchFn)
    await sendAndSettle(result, 'What is vacant today?')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/chat')
    const body = sentBody(fetchFn, 0)
    expect(ChatRequestSchema.safeParse(body).success).toBe(true)
    expect(body).toEqual({ ...SNAPSHOT, messages: [{ role: 'user', text: 'What is vacant today?' }] })
  })

  it('the streamed text ends up in messages', async () => {
    const { result } = renderChat(answering('Vacant is 38,150 SF on 15 Nov 2026.'))
    await sendAndSettle(result, 'What is vacant today?')
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(result.current.messages.map((m) => [m.role, m.text])).toEqual([
      ['user', 'What is vacant today?'],
      ['assistant', 'Vacant is 38,150 SF on 15 Nov 2026.'],
    ])
    expect(result.current.messages[1]).toMatchObject({ pending: false, stopped: false, fill: null })
    expect(result.current.error).toBeNull()
  })

  it('after the snapshot changes, the next send carries the new values and the history (FR6)', async () => {
    const fetchFn = answering()
    const { result, rerender } = renderChat(fetchFn)
    await sendAndSettle(result, 'First?')
    const changes: ChatSnapshot['changes'] = [{ kind: 'vacate', leaseId: 'odt-l-1', on: '2027-01-01' }]
    rerender({ snap: { ...SNAPSHOT, asOf: '2027-05-15', changes } })
    await sendAndSettle(result, 'Second?')
    const body = sentBody(fetchFn, 1)
    expect(ChatRequestSchema.safeParse(body).success).toBe(true)
    expect(body.asOf).toBe('2027-05-15')
    expect(body.changes).toEqual(changes)
    expect(body.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(body.messages[2]?.text).toBe('Second?')
  })

  it('a 429 gives the rate-limit error kind', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ error: 'Too many requests' }, { status: 429 }))
    const { result } = renderChat(fetchFn)
    await sendAndSettle(result, 'Hello?')
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('rate-limit')
  })

  it('a 502 or a network error gives the generic error kind', async () => {
    const { result } = renderChat(vi.fn<typeof fetch>(async () => Response.json({ error: 'x' }, { status: 502 })))
    await sendAndSettle(result, 'Hello?')
    expect(result.current.error).toBe('failed')
    const offline = renderChat(vi.fn<typeof fetch>(async () => { throw new TypeError('Failed to fetch') }))
    await sendAndSettle(offline.result, 'Hello?')
    expect(offline.result.current.error).toBe('failed')
  })

  it('a stream that ends with an error chunk gives the generic error kind, with no empty answer left', async () => {
    const { result } = renderChat(vi.fn<typeof fetch>(async () => streamError()))
    await sendAndSettle(result, 'Hello?')
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('failed')
    expect(result.current.messages.map((m) => m.role)).toEqual(['user'])
  })

  it('retry sends the conversation again and clears the error', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockImplementationOnce(async () => Response.json({ error: 'x' }, { status: 502 }))
      .mockImplementation(async () => answer('Second try worked.'))
    const { result } = renderChat(fetchFn)
    await sendAndSettle(result, 'Hello?')
    expect(result.current.error).toBe('failed')
    await act(() => result.current.retry())
    await waitFor(() => expect(result.current.messages.at(-1)?.text).toBe('Second try worked.'))
    expect(result.current.error).toBeNull()
    expect(sentBody(fetchFn, 1).messages).toEqual([{ role: 'user', text: 'Hello?' }])
  })

  it('stop() during a stream aborts the request signal, keeps the partial text and marks it stopped', async () => {
    let signal: AbortSignal | null | undefined
    const gate = new Promise<void>(() => {})
    const fetchFn = vi.fn<typeof fetch>(async (_input, init) => {
      signal = init?.signal
      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: async ({ writer }) => {
            writer.write({ type: 'text-start', id: 't1' })
            writer.write({ type: 'text-delta', id: 't1', delta: 'Vacant is 38,' })
            await gate
          },
        }),
      })
    })
    const { result } = renderChat(fetchFn)
    act(() => { void result.current.send('What is vacant?') })
    await waitFor(() => expect(result.current.messages.at(-1)?.text).toBe('Vacant is 38,'))
    expect(result.current.status).toBe('streaming')
    await act(async () => result.current.stop())
    expect(signal?.aborted).toBe(true)
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.error).toBeNull()
    expect(result.current.messages.at(-1)).toMatchObject({ role: 'assistant', text: 'Vacant is 38,', stopped: true })
    expect(result.current.messages[0]?.stopped).toBe(false)
  })

  it('reset empties the conversation', async () => {
    const { result } = renderChat(answering())
    await sendAndSettle(result, 'Hello?')
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    act(() => result.current.reset())
    await waitFor(() => expect(result.current.messages).toHaveLength(0))
    expect(result.current.turnsLeft).toBe(CHAT_MAX_TURNS)
    expect(result.current.error).toBeNull()
  })

  it(`turnsLeft counts down and reaches 0 after ${CHAT_MAX_TURNS} sends`, async () => {
    const { result } = renderChat(answering('Ok.'))
    expect(result.current.turnsLeft).toBe(CHAT_MAX_TURNS)
    for (let i = 0; i < CHAT_MAX_TURNS; i += 1) {
      await sendAndSettle(result, `Question ${i}`)
      await waitFor(() => expect(result.current.messages).toHaveLength((i + 1) * 2))
    }
    expect(result.current.turnsLeft).toBe(0)
  })

  it('a requirement data part is validated and handed to onRequirement, and the answer row carries the fill', async () => {
    const fx = effects()
    const { result } = renderChat(vi.fn<typeof fetch>(async () => answerWithData({ minSf: 9000, maxRentPsf: 60 })), SNAPSHOT, fx)
    await sendAndSettle(result, 'Law firm, 9k SF under $60')
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(fx.onRequirement).toHaveBeenCalledTimes(1)
    expect(fx.onRequirement).toHaveBeenCalledWith({ minSf: 9000, maxRentPsf: 60 })
    expect(result.current.messages[1]).toMatchObject({
      text: '500 fits.', fill: { parsed: { minSf: 9000, maxRentPsf: 60 }, source: 'ai', applied: true },
    })
    expect(result.current.messages[0]?.fill).toBeNull()
  })

  it.each([
    ['a string size', { minSf: 'lots' }],
    ['an unknown key', { minSf: 9000, action: 'clearShortlist' }],
    ['no size', { maxRentPsf: 60 }],
    ['null', null],
    ['a string', 'apply everything'],
  ])('a malformed requirement part (%s) is ignored: no effect, no fill, the answer still shows', async (_name, data) => {
    const fx = effects()
    const { result } = renderChat(vi.fn<typeof fetch>(async () => answerWithData(data)), SNAPSHOT, fx)
    await sendAndSettle(result, 'Something')
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(fx.onRequirement).not.toHaveBeenCalled()
    expect(result.current.messages[1]).toMatchObject({ text: '500 fits.', fill: null })
    expect(result.current.error).toBeNull()
  })

  it('a requirement the form did not take is marked not applied', async () => {
    const fx = effects(false)
    const { result } = renderChat(vi.fn<typeof fetch>(async () => answerWithData({ minSf: 9000 })), SNAPSHOT, fx)
    await sendAndSettle(result, '9k SF')
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(result.current.messages[1]?.fill).toMatchObject({ applied: false })
  })

  it('history sent to the server stays text only: the requirement part never goes back', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => answerWithData({ minSf: 9000 }))
    const { result } = renderChat(fetchFn, SNAPSHOT, effects())
    await sendAndSettle(result, '9k SF')
    await sendAndSettle(result, 'And under $50?')
    const body = sentBody(fetchFn, 1)
    expect(ChatRequestSchema.safeParse(body).success).toBe(true)
    expect(JSON.stringify(body)).not.toContain('requirement')
  })

  it('a failed turn calls onFailure with the broker\'s last message; a stopped one does not', async () => {
    const fx = effects()
    const { result } = renderChat(vi.fn<typeof fetch>(async () => Response.json({ error: 'x' }, { status: 502 })), SNAPSHOT, fx)
    await sendAndSettle(result, '10k SF by June')
    expect(fx.onFailure).toHaveBeenCalledWith('10k SF by June')

    const fx2 = effects()
    const gate = new Promise<void>(() => {})
    const hanging = vi.fn<typeof fetch>(async () => createUIMessageStreamResponse({
      stream: createUIMessageStream({ execute: async ({ writer }) => { writer.write({ type: 'text-start', id: 't1' }); await gate } }),
    }))
    const stopped = renderChat(hanging, SNAPSHOT, fx2)
    act(() => { void stopped.result.current.send('Hello?') })
    await waitFor(() => expect(stopped.result.current.status).toBe('streaming'))
    await act(async () => stopped.result.current.stop())
    expect(fx2.onFailure).not.toHaveBeenCalled()
  })
})
