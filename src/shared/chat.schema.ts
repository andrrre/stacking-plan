import { z } from 'zod'
import { ChangeSchema } from './domain.schema.js'
import { isoDate } from './isoDate.js'
import { MAX_RENT_PSF, MAX_REQ_SF, MIN_RENT_PSF, MIN_REQ_SF } from './limits.js'

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

/**
 * The one UI effect the chat stream may carry: the requirement the model searched with (find_space's validated
 * input, without includePotential, which the form keeps as the broker set it). The server sends it as a data part
 * named CHAT_REQUIREMENT_PART; the browser parses it with this schema before filling the search form, and ignores
 * anything that fails.
 */
export const CHAT_REQUIREMENT_PART = 'data-requirement'

const reqSf = z.number().int().min(MIN_REQ_SF).max(MAX_REQ_SF)

export const ChatRequirementSchema = z
  .strictObject({
    minSf: reqSf,
    maxSf: reqSf.optional(),
    maxRentPsf: z.number().min(MIN_RENT_PSF).max(MAX_RENT_PSF).optional(),
    moveInBy: isoDate.optional(),
  })
  .refine((r) => r.maxSf === undefined || r.maxSf >= r.minSf, { message: 'maxSf must not be below minSf', path: ['maxSf'] })

export type ChatRequirement = z.infer<typeof ChatRequirementSchema>
