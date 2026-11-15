import { createAnthropic, type AnthropicLanguageModelOptions } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'

export type ServerEnv = Readonly<Record<string, string | undefined>>

const DEFAULT_MODEL = 'claude-haiku-5-5'

/**
 * Provider options for both calls: no extended or adaptive thinking, so the output cap is spent on the answer.
 * The default model accepts this; a model that cannot disable thinking gets a provider warning and its default.
 */
export const NO_THINKING = { anthropic: { thinking: { type: 'disabled' } } satisfies AnthropicLanguageModelOptions }

/** The configured model, or null when no API key is set. The key is read only here, on the server. */
export function getModel(env: ServerEnv): LanguageModel | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return null
  return createAnthropic({ apiKey })(env.AI_MODEL?.trim() || DEFAULT_MODEL)
}
