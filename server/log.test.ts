// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { logAiError } from './log.js'

const KEY = 'sk-ant-test-secret-value'

function captured(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(console, 'error').mockImplementation(() => undefined)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logAiError', () => {
  it('writes one line "[ai:<route>] Name: message"', () => {
    const spy = captured()
    logAiError('chat', new TypeError('model not found'), {})
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]).toEqual(['[ai:chat] TypeError: model not found'])
  })

  it('cuts "name: message" to 300 characters', () => {
    const spy = captured()
    logAiError('ask', new Error('x'.repeat(400)), {})
    expect(spy.mock.calls[0]?.[0]).toBe(`[ai:ask] Error: ${'x'.repeat(293)}`)
  })

  it('cuts a long error name too', () => {
    const spy = captured()
    logAiError('ask', Object.assign(new Error('m'), { name: 'N'.repeat(400) }), {})
    expect(spy.mock.calls[0]?.[0]).toBe(`[ai:ask] ${'N'.repeat(300)}`)
  })

  it('replaces the key value with [key] wherever it appears', () => {
    const spy = captured()
    logAiError('summary', new Error(`bad key ${KEY} and again ${KEY}`), { ANTHROPIC_API_KEY: ` ${KEY} ` })
    const line = String(spy.mock.calls[0]?.[0])
    expect(line).toBe('[ai:summary] Error: bad key [key] and again [key]')
    expect(line).not.toContain(KEY)
  })

  it('redacts the key before cutting, so a key that straddles the cut does not leak a prefix', () => {
    const spy = captured()
    logAiError('chat', new Error(`${'y'.repeat(290)}${KEY}`), { ANTHROPIC_API_KEY: KEY })
    expect(String(spy.mock.calls[0]?.[0])).not.toContain(KEY.slice(0, 10))
  })

  it('redacts the key inside the error name too', () => {
    const spy = captured()
    const error = Object.assign(new Error('failed'), { name: `Bad${KEY}` })
    logAiError('chat', error, { ANTHROPIC_API_KEY: KEY })
    expect(spy.mock.calls[0]).toEqual(['[ai:chat] Bad[key]: failed'])
  })

  it('writes one line even when the message holds line breaks', () => {
    const spy = captured()
    logAiError('chat', new Error('first\r\n[ai:chat] forged: line\n\nthird'), {})
    expect(spy.mock.calls[0]).toEqual(['[ai:chat] Error: first [ai:chat] forged: line third'])
  })

  it('handles a non-Error value', () => {
    const spy = captured()
    logAiError('chat', 'plain string failure', {})
    logAiError('chat', undefined, {})
    expect(spy.mock.calls[0]).toEqual(['[ai:chat] Error: plain string failure'])
    expect(spy.mock.calls[1]).toEqual(['[ai:chat] Error: undefined'])
  })
})
