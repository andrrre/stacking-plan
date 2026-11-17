import type { ServerEnv } from './model.js'

const MAX_LINE_CHARS = 300

/**
 * The one server log line for a failed model call: `[ai:<route>] <name>: <message>`. The key value is replaced by
 * `[key]` in the whole `name: message` text, line breaks become spaces (one error, one line), and only then is the
 * text cut, so neither the key nor a prefix of it can be written. No request content is logged.
 */
export function logAiError(route: string, error: unknown, env: ServerEnv): void {
  const name = error instanceof Error ? error.name : 'Error'
  const message = error instanceof Error ? error.message : String(error)
  const key = env.ANTHROPIC_API_KEY?.trim()
  const raw = `${name}: ${message}`
  const text = (key ? raw.split(key).join('[key]') : raw).replace(/[\r\n]+/g, ' ').slice(0, MAX_LINE_CHARS)
  // eslint-disable-next-line no-console
  console.error(`[ai:${route}] ${text}`)
}
