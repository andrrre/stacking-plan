import type { UIMessage } from 'ai'
import type { Change, ISODate } from '../../domain/types'
import { CHAT_MAX_ASSISTANT_CHARS, CHAT_MAX_MESSAGES, type ChatMessage, type ChatRequest } from '../../shared/chat.schema'

/** What the broker is looking at when a message is sent (FR4). */
export type ChatSnapshot = { buildingId: string; today: ISODate; asOf: ISODate; changes: Change[] }

/** Longer than the server's 25 s abort, so the server's own error reaches the panel first. */
const CLIENT_TIMEOUT_MS = 30_000

/** A message's text parts, joined; tool, reasoning and step parts are left out. */
export function messageText(message: UIMessage): string {
  return message.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n')
}

function toChatMessage(message: UIMessage): ChatMessage | null {
  const text = messageText(message)
  if (text.trim() === '') return null
  if (message.role === 'user') return { role: 'user', text }
  if (message.role === 'assistant') return { role: 'assistant', text: text.slice(0, CHAT_MAX_ASSISTANT_CHARS) }
  return null
}

/** The request body: the snapshot plus the newest text-only messages (B3). */
export function toChatRequest(snapshot: ChatSnapshot, messages: readonly UIMessage[]): ChatRequest {
  const history = messages.map(toChatMessage).filter((m): m is ChatMessage => m !== null)
  return {
    buildingId: snapshot.buildingId,
    today: snapshot.today,
    asOf: snapshot.asOf,
    changes: snapshot.changes,
    messages: history.slice(-CHAT_MAX_MESSAGES),
  }
}

/** Broker turns used so far. */
export function turnsUsed(messages: readonly { role: string }[]): number {
  return messages.filter((m) => m.role === 'user').length
}

/**
 * The transport's fetch: keeps the caller's signal (Stop) and adds a client timeout; a failure status becomes
 * `chat-http-<status>` so the panel can tell a rate limit from everything else.
 */
export async function chatFetch(input: RequestInfo | URL, init?: RequestInit, fetchFn: typeof fetch = fetch): Promise<Response> {
  const signals = [init?.signal, AbortSignal.timeout(CLIENT_TIMEOUT_MS)].filter((s): s is AbortSignal => s != null)
  const res = await fetchFn(input, { ...init, signal: AbortSignal.any(signals) })
  if (!res.ok) throw new Error(`chat-http-${res.status}`)
  return res
}
