import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chat, useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import type { ISODate, ParsedQuery } from '../../domain/types'
import { CHAT_MAX_TURNS, CHAT_REQUIREMENT_PART } from '../../shared/chat.schema'
import { chatFetch, messageText, toChatRequest, turnsUsed, type ChatSnapshot } from './chatRequest'
import { readRequirement, type Fill } from './requirementFill'

export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'
/** 'rate-limit': the server answered 429; 'failed': anything else (502/504, network, an in-stream error). */
export type ChatErrorKind = 'rate-limit' | 'failed' | null
/** What the panel shows for one message: plain data, no SDK types. `fill`: the requirement it put into the form. */
export type PanelMessage = {
  id: string; role: 'user' | 'assistant'; text: string; pending: boolean; stopped: boolean; fill: Fill | null
}

/** What the conversation may do outside itself: fill the search form, and fall back when a turn fails. */
export type ChatEffects = {
  /** A schema-valid requirement from the stream; returns whether the form took it. */
  onRequirement: (requirement: ParsedQuery) => boolean
  /** A turn failed (not stopped); `lastUserText` is the broker's last message. */
  onFailure: (lastUserText: string) => void
}

type ChatEvents = { onData: (part: { type: string; data: unknown }) => void; onError: () => void }
/** Forwards the Chat's callbacks to the handlers set last; the Chat outlives every render that sets them. */
type EventRelay = ChatEvents & { set: (events: ChatEvents) => void }

const CHAT_API = '/api/chat'
const NO_EFFECTS: ChatEffects = { onRequirement: () => false, onFailure: () => undefined }

function eventRelay(): EventRelay {
  let events: ChatEvents = { onData: () => undefined, onError: () => undefined }
  return {
    set: (next) => { events = next },
    onData: (part) => events.onData(part),
    onError: () => events.onError(),
  }
}

export const isBusy = (status: ChatStatus) => status === 'submitted' || status === 'streaming'

function errorKind(error: Error | undefined): ChatErrorKind {
  if (!error) return null
  return error.message === 'chat-http-429' ? 'rate-limit' : 'failed'
}

/** The last schema-valid requirement part of a message; malformed parts are ignored. */
function messageRequirement(message: UIMessage, today: ISODate): ParsedQuery | null {
  return message.parts.reduce<ParsedQuery | null>(
    (found, p) => (p.type === CHAT_REQUIREMENT_PART ? readRequirement((p as { data?: unknown }).data, today) ?? found : found),
    null,
  )
}

/** Plain rows; an assistant row's fill was applied unless its turn (count of broker messages so far) was skipped. */
function toRows(messages: readonly UIMessage[], today: ISODate, stopped: ReadonlySet<string>, skipped: ReadonlySet<number>): PanelMessage[] {
  let turn = 0
  return messages.flatMap((m): PanelMessage[] => {
    if (m.role !== 'user' && m.role !== 'assistant') return []
    if (m.role === 'user') turn += 1
    const requirement = m.role === 'assistant' ? messageRequirement(m, today) : null
    const fill: Fill | null = requirement ? { parsed: requirement, source: 'ai', applied: !skipped.has(turn) } : null
    return [{ id: m.id, role: m.role, text: messageText(m), pending: false, stopped: stopped.has(m.id), fill }]
  })
}

/**
 * The last assistant row is pending while the turn runs and it has no text yet (a tool lookup); an empty one left by
 * a failed turn is dropped, the error says it instead.
 */
function withPending(rows: PanelMessage[], status: ChatStatus): PanelMessage[] {
  const last = rows.at(-1)
  if (last?.role !== 'assistant' || last.text !== '' || last.stopped) return rows
  if (status === 'error') return rows.slice(0, -1)
  return isBusy(status) ? [...rows.slice(0, -1), { ...last, pending: true }] : rows
}

/** The snapshot rides in each call's body options; the transport turns it and the messages into the contract. */
function snapshotOf(body: Record<string, unknown> | undefined): ChatSnapshot {
  const snapshot = body?.snapshot as ChatSnapshot | undefined
  if (!snapshot) throw new Error('chat-no-snapshot')
  return snapshot
}

/** One Chat for the hook's lifetime; its data and error callbacks go through `relay`. */
function useChatInstance(fetchFn: typeof fetch, relay: EventRelay): Chat<UIMessage> {
  const [chat] = useState(() => new Chat<UIMessage>({
    transport: new DefaultChatTransport<UIMessage>({
      api: CHAT_API,
      fetch: (input, init) => chatFetch(input, init, fetchFn),
      prepareSendMessagesRequest: ({ messages, body }) => ({ body: toChatRequest(snapshotOf(body), messages) }),
    }),
    onData: relay.onData,
    onError: relay.onError,
  }))
  return chat
}

/**
 * Routes the stream's requirement parts to `effects.onRequirement` (validated first; anything else is ignored) and
 * failures to `effects.onFailure`. Returns the turns whose requirement the form did not take.
 */
function useChatEvents(chat: Chat<UIMessage>, relay: EventRelay, today: ISODate, effects: ChatEffects) {
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(() => new Set())
  useEffect(() => {
    relay.set({
      onData: (part) => {
        if (part.type !== CHAT_REQUIREMENT_PART) return
        const requirement = readRequirement(part.data, today)
        if (!requirement) return
        const turn = turnsUsed(chat.messages)
        const applied = effects.onRequirement(requirement)
        setSkipped((prev) => new Set(applied ? [...prev].filter((t) => t !== turn) : [...prev, turn]))
      },
      onError: () => {
        const last = chat.messages.findLast((m) => m.role === 'user')
        effects.onFailure(last ? messageText(last) : '')
      },
    })
  })
  return { skipped, clearSkipped: () => setSkipped(new Set()) }
}

/**
 * The building chat's state (B8). Each send and retry carries the snapshot of that moment, so a new as-of date
 * or scenario applies to the next turn (FR6). Mount it per building: it has no building switch logic.
 */
export function useBuildingChat(
  snapshot: ChatSnapshot, fetchFn: typeof fetch = (input, init) => fetch(input, init), effects: ChatEffects = NO_EFFECTS,
) {
  const [relay] = useState(eventRelay)
  const chat = useChatInstance(fetchFn, relay)
  const { skipped, clearSkipped } = useChatEvents(chat, relay, snapshot.today, effects)
  const { messages, status, error, sendMessage, regenerate, stop: stopChat, setMessages, clearError } = useChat({ chat })
  const [stopped, setStopped] = useState<ReadonlySet<string>>(() => new Set())

  const stop = useCallback(async () => {
    const last = chat.messages.at(-1)
    if (last?.role === 'assistant' && isBusy(chat.status)) setStopped((prev) => new Set([...prev, last.id]))
    await stopChat()
  }, [chat, stopChat])

  const reset = () => {
    void stopChat()
    setMessages([])
    clearError()
    setStopped(new Set())
    clearSkipped()
  }

  const send = useCallback((text: string) => sendMessage({ text: text.trim() }, { body: { snapshot } }), [sendMessage, snapshot])
  const retry = useCallback(() => regenerate({ body: { snapshot } }), [regenerate, snapshot])
  const panelMessages = useMemo(
    () => withPending(toRows(messages, snapshot.today, stopped, skipped), status),
    [messages, snapshot.today, stopped, skipped, status],
  )

  return {
    messages: panelMessages,
    status,
    error: errorKind(error),
    send,
    stop,
    retry,
    reset,
    turnsLeft: Math.max(0, CHAT_MAX_TURNS - turnsUsed(messages)),
  }
}
