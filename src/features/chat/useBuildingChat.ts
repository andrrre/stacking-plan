import { useCallback, useMemo, useState } from 'react'
import { Chat, useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { CHAT_MAX_TURNS } from '../../shared/chat.schema'
import { chatFetch, messageText, toChatRequest, turnsUsed, type ChatSnapshot } from './chatRequest'

export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'
/** 'rate-limit': the server answered 429; 'failed': anything else (502/504, network, an in-stream error). */
export type ChatErrorKind = 'rate-limit' | 'failed' | null
/** What the panel shows for one message: plain data, no SDK types. */
export type PanelMessage = { id: string; role: 'user' | 'assistant'; text: string; pending: boolean; stopped: boolean }

const CHAT_API = '/api/chat'

export const isBusy = (status: ChatStatus) => status === 'submitted' || status === 'streaming'

function errorKind(error: Error | undefined): ChatErrorKind {
  if (!error) return null
  return error.message === 'chat-http-429' ? 'rate-limit' : 'failed'
}

/**
 * Plain panel rows. The last assistant message is pending while the turn runs and it has no text yet (a tool
 * lookup); an empty one left by a failed turn is dropped, the error says it instead.
 */
function toPanelMessages(messages: readonly UIMessage[], status: ChatStatus, stopped: ReadonlySet<string>): PanelMessage[] {
  const rows = messages.flatMap((m): PanelMessage[] =>
    m.role === 'user' || m.role === 'assistant'
      ? [{ id: m.id, role: m.role, text: messageText(m), pending: false, stopped: stopped.has(m.id) }]
      : [])
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

/** One Chat for the hook's lifetime. */
function useChatInstance(fetchFn: typeof fetch): Chat<UIMessage> {
  const [chat] = useState(() => new Chat<UIMessage>({
    transport: new DefaultChatTransport<UIMessage>({
      api: CHAT_API,
      fetch: (input, init) => chatFetch(input, init, fetchFn),
      prepareSendMessagesRequest: ({ messages, body }) => ({ body: toChatRequest(snapshotOf(body), messages) }),
    }),
  }))
  return chat
}

/**
 * The building chat's state (B8). Each send and retry carries the snapshot of that moment, so a new as-of date
 * or scenario applies to the next turn (FR6). Mount it per building: it has no building switch logic.
 */
export function useBuildingChat(snapshot: ChatSnapshot, fetchFn: typeof fetch = (input, init) => fetch(input, init)) {
  const chat = useChatInstance(fetchFn)
  const { messages, status, error, sendMessage, regenerate, stop: stopChat, setMessages, clearError } = useChat({ chat })
  const [stopped, setStopped] = useState<ReadonlySet<string>>(() => new Set())

  const stop = useCallback(async () => {
    const last = chat.messages.at(-1)
    if (last?.role === 'assistant' && isBusy(chat.status)) setStopped((prev) => new Set([...prev, last.id]))
    await stopChat()
  }, [chat, stopChat])

  const reset = useCallback(() => {
    void stopChat()
    setMessages([])
    clearError()
    setStopped(new Set())
  }, [stopChat, setMessages, clearError])

  const send = useCallback((text: string) => sendMessage({ text: text.trim() }, { body: { snapshot } }), [sendMessage, snapshot])
  const retry = useCallback(() => regenerate({ body: { snapshot } }), [regenerate, snapshot])
  const panelMessages = useMemo(() => toPanelMessages(messages, status, stopped), [messages, status, stopped])

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
