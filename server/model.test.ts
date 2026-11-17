import { describe, expect, it } from 'vitest'
import { getChatModel } from './model'

const idOf = (model: unknown): string => (model as { modelId: string }).modelId

describe('getChatModel', () => {
  it('is null without an API key', () => {
    expect(getChatModel({})).toBeNull()
    expect(getChatModel({ ANTHROPIC_API_KEY: '  ' })).toBeNull()
  })

  it('defaults to Haiku', () => {
    expect(idOf(getChatModel({ ANTHROPIC_API_KEY: 'k' }))).toBe('claude-haiku-5-5')
    expect(idOf(getChatModel({ ANTHROPIC_API_KEY: 'k', AI_CHAT_MODEL: ' ' }))).toBe('claude-haiku-5-5')
  })

  it('uses AI_CHAT_MODEL when set, not AI_MODEL', () => {
    const env = { ANTHROPIC_API_KEY: 'k', AI_MODEL: 'claude-other', AI_CHAT_MODEL: ' claude-custom ' }
    expect(idOf(getChatModel(env))).toBe('claude-custom')
  })
})
