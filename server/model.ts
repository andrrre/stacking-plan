import { createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'

export type ServerEnv = Readonly<Record<string, string | undefined>>

const DEFAULT_MODEL = 'claude-haiku-5-5'

/** The configured model, or null when no API key is set. The key is read only here, on the server. */
export function getModel(env: ServerEnv): LanguageModel | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return null
  return createAnthropic({ apiKey })(env.AI_MODEL?.trim() || DEFAULT_MODEL)
}
