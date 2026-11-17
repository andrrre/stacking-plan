import {
  createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream,
  type LanguageModel, type ModelMessage, type UIMessageChunk,
} from 'ai'
import { ChatRequestSchema, type ChatMessage } from '../src/shared/chat.schema.js'
import { chatContext, type ChatContext } from './chatContext.js'
import { chatInstructions } from './chatPrompt.js'
import { chatTools } from './chatTools.js'
import { clientIp, jsonError, readJsonBody, refusal } from './http.js'
import { logAiError } from './log.js'
import { CHAT_PROVIDER_OPTIONS, getChatModel, type ServerEnv } from './model.js'
import { allow } from './rateLimit.js'

// Ten 500-character questions, ten 2,000-character answers and fifty changes stay under this.
const MAX_BODY_BYTES = 48_000
// The function's maxDuration is 30 s (vercel.json); the server gives up first, the client (30 s) after.
const TIMEOUT_MS = 25_000
const MAX_STEPS = 5
// Per step. The default model's adaptive thinking counts toward it, and a step that reaches it ends the turn
// mid-answer, so it leaves wide room above a 120-word answer.
const MAX_OUTPUT_TOKENS = 4000
/** The only error text the browser ever sees from the stream. */
const STREAM_ERROR_TEXT = 'AI request failed'

/** Test seams: a model to use instead of the configured one (the key rule still applies), and the turn timeout. */
export type ChatSeams = { model?: LanguageModel; timeoutMs?: number }

/** GET /api/chat: whether a chat model is configured. No model call, no rate limit. */
export async function handleChatStatus(_request: Request, env: ServerEnv): Promise<Response> {
  return Response.json({ available: getChatModel(env) !== null })
}

/** Client-supplied history is data: plain user / assistant text only, never system messages or tool parts. */
const toModelMessages = (messages: readonly ChatMessage[]): ModelMessage[] =>
  messages.map((m) => ({ role: m.role, content: m.text }))

/** The UI chunk types the client renders or needs to finish a message; the rest (tool, custom, file, source, data, ...) stay on the server. */
const BROWSER_CHUNK_TYPES: ReadonlySet<UIMessageChunk['type']> = new Set([
  'start', 'start-step', 'text-start', 'text-delta', 'text-end', 'finish-step', 'finish', 'error', 'abort',
])

/**
 * What the browser receives: only BROWSER_CHUNK_TYPES. Tool chunks are dropped: the client renders text only, and the
 * model gets the tool results inside streamText, not through this stream. Provider chunks (`custom`, carrying the
 * model id and token usage) are dropped too. A server-side timeout ends the UI stream with an `abort`
 * chunk, which the client would read as a finished answer; unless the client itself aborted (Stop), turn it into the
 * generic error chunk and log it once.
 */
function forBrowser(request: Request, signal: AbortSignal, env: ServerEnv): TransformStream<UIMessageChunk, UIMessageChunk> {
  return new TransformStream({
    transform(chunk, controller) {
      if (!BROWSER_CHUNK_TYPES.has(chunk.type)) return
      if (chunk.type !== 'abort' || request.signal.aborted) {
        controller.enqueue(chunk)
        return
      }
      logAiError('chat', signal.reason, env)
      controller.enqueue({ type: 'error', errorText: STREAM_ERROR_TEXT })
    },
  })
}

function streamAnswer(request: Request, env: ServerEnv, ctx: ChatContext, messages: readonly ChatMessage[], seams: Required<ChatSeams>): Response {
  const abortSignal = AbortSignal.any([request.signal, AbortSignal.timeout(seams.timeoutMs)])
  const result = streamText({
    model: seams.model,
    instructions: chatInstructions(ctx),
    messages: toModelMessages(messages),
    tools: chatTools(ctx),
    stopWhen: isStepCount(MAX_STEPS),
    // stepNumber is zero-based: the last allowed step can only answer, so a turn never ends on a tool call.
    // The tools stay in the request because earlier tool calls in the history need their definitions.
    prepareStep: ({ stepNumber }) => (stepNumber === MAX_STEPS - 1 ? { toolChoice: 'none' } : undefined),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 0,
    abortSignal,
    providerOptions: CHAT_PROVIDER_OPTIONS,
    onError: ({ error }) => logAiError('chat', error, env),
  })
  const stream = toUIMessageStream({
    stream: result.stream,
    sendReasoning: false,
    sendSources: false,
    onError: () => STREAM_ERROR_TEXT,
  })
  return createUIMessageStreamResponse({ stream: stream.pipeThrough(forBrowser(request, abortSignal, env)) })
}

/** POST /api/chat: a streamed answer about one bundled building, every figure from a read-only tool. */
export async function handleChat(request: Request, env: ServerEnv, nowMs: number = Date.now(), seams: ChatSeams = {}): Promise<Response> {
  const refused = refusal(request, MAX_BODY_BYTES)
  if (refused !== null) return jsonError(refused)
  if (!allow(clientIp(request), nowMs)) return jsonError(429)
  const read = await readJsonBody(request, MAX_BODY_BYTES)
  if (!read.ok) return jsonError(read.status)
  const body = ChatRequestSchema.safeParse(read.value)
  if (!body.success) return jsonError(400)
  const context = chatContext(body.data)
  if (!context.ok) return jsonError(400)
  const configured = getChatModel(env)
  if (!configured) return jsonError(503)
  const model = seams.model ?? configured
  return streamAnswer(request, env, context.context, body.data.messages, { model, timeoutMs: seams.timeoutMs ?? TIMEOUT_MS })
}
