import { z } from 'zod'
import { ChangeSchema } from './domain.schema.js'
import { isoDate } from './isoDate.js'

export const CHAT_MAX_USER_CHARS = 500
export const CHAT_MAX_ASSISTANT_CHARS = 2000
export const CHAT_MAX_TURNS = 10
export const CHAT_MAX_MESSAGES = 20
export const CHAT_MAX_CHANGES = 50

const MAX_BUILDING_ID = 120

const ChatMessageSchema = z.discriminatedUnion('role', [
  z.strictObject({ role: z.literal('user'), text: z.string().trim().min(1).max(CHAT_MAX_USER_CHARS) }),
  z.strictObject({ role: z.literal('assistant'), text: z.string().min(1).max(CHAT_MAX_ASSISTANT_CHARS) }),
])

export const ChatRequestSchema = z
  .strictObject({
    buildingId: z.string().min(1).max(MAX_BUILDING_ID),
    today: isoDate,
    asOf: isoDate,
    changes: z.array(ChangeSchema).max(CHAT_MAX_CHANGES),
    messages: z.array(ChatMessageSchema).min(1).max(CHAT_MAX_MESSAGES),
  })
  .refine((r) => r.asOf >= r.today, { message: 'asOf must not be before today', path: ['asOf'] })
  .refine((r) => r.messages[r.messages.length - 1]?.role === 'user', {
    message: 'the last message must be from the user',
    path: ['messages'],
  })
  .refine((r) => r.messages.filter((m) => m.role === 'user').length <= CHAT_MAX_TURNS, {
    message: `at most ${CHAT_MAX_TURNS} user messages`,
    path: ['messages'],
  })

export type ChatRequest = z.infer<typeof ChatRequestSchema>
export type ChatMessage = ChatRequest['messages'][number]
