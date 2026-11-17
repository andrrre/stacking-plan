import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { initState } from '../../app/state/init'
import { StateProvider } from '../../app/state/StateProvider'
import { useAppState } from '../../app/state/useAppState'
import { localAnswer, useAiAssistant, useLocalAssistant, type LocalReason } from './useAssistant'

const TODAY = '2026-11-15'
const SNAPSHOT = { buildingId: 'odt', today: TODAY, asOf: TODAY, changes: [] }
const LAW_FIRM = 'Law firm, roughly 9–11k SF, moving in by Q2 next year, under $60'

const wrapper = ({ children }: { children: ReactNode }) => <StateProvider initialState={initState('', null, TODAY)}>{children}</StateProvider>

const renderLocal = (reason: LocalReason = 'unavailable') =>
  renderHook(() => ({ assistant: useLocalAssistant(reason, TODAY), app: useAppState() }), { wrapper })

const renderAi = () => renderHook(() => ({ assistant: useAiAssistant(SNAPSHOT), app: useAppState() }), { wrapper })

afterEach(() => vi.unstubAllGlobals())

describe('useLocalAssistant', () => {
  it('a requirement fills the form and gets the honest "read locally" answer with an offline fill', () => {
    const fetchFn = vi.fn()
    vi.stubGlobal('fetch', fetchFn)
    const { result } = renderLocal()
    act(() => result.current.assistant.send(LAW_FIRM))
    expect(result.current.app.state.req).toMatchObject({ minSf: 9000, maxSf: 11000, maxRentPsf: 60 })
    expect(result.current.app.state.asOf.slice(0, 7)).toBe('2027-06')
    const [user, answer] = result.current.assistant.messages
    expect(user).toMatchObject({ role: 'user', text: LAW_FIRM, fill: null })
    expect(answer).toMatchObject({ role: 'assistant', text: 'AI is unavailable. The requirement was read locally.' })
    expect(answer?.fill).toEqual({ parsed: { minSf: 9000, maxSf: 11000, maxRentPsf: 60, moveInBy: '2027-06-30' }, source: 'offline', applied: true })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('an open question leaves the form alone and says only a requirement can be read here', () => {
    const { result } = renderLocal()
    act(() => result.current.app.dispatch({ type: 'req/set', patch: { minSf: 12000 } }))
    act(() => result.current.assistant.send('What is vacant on this date?'))
    expect(result.current.app.state.req.minSf).toBe(12000)
    expect(result.current.assistant.messages[1]).toMatchObject({ text: localAnswer('unavailable', false), fill: null })
    expect(result.current.assistant.messages[1]?.text).toContain('Only a space requirement can be read here')
  })

  it('an imported building says why the AI is off', () => {
    const { result } = renderLocal('imported')
    act(() => result.current.assistant.send('2,000 SF under $60'))
    expect(result.current.assistant.messages[1]?.text)
      .toBe('AI is off for imported buildings: their data stays in this browser. The requirement was read locally.')
  })

  it('reset empties the conversation; it is never busy and never errors', () => {
    const { result } = renderLocal()
    act(() => result.current.assistant.send('10k SF'))
    expect(result.current.assistant.status).toBe('ready')
    expect(result.current.assistant.error).toBeNull()
    act(() => result.current.assistant.reset())
    expect(result.current.assistant.messages).toEqual([])
  })
})

describe('useAiAssistant', () => {
  it('when the AI fails, a requirement is read locally into the form and offered as the fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'AI unavailable' }, { status: 503 })))
    const { result } = renderAi()
    act(() => result.current.assistant.send(LAW_FIRM))
    await waitFor(() => expect(result.current.assistant.error).toBe('failed'))
    expect(result.current.app.state.req).toMatchObject({ minSf: 9000, maxSf: 11000, maxRentPsf: 60 })
    expect(result.current.assistant.fallback).toMatchObject({ source: 'offline', applied: true, parsed: { minSf: 9000 } })
  })

  it('when the AI fails on an open question, there is no fallback and the form is untouched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Too many requests' }, { status: 429 })))
    const { result } = renderAi()
    act(() => result.current.app.dispatch({ type: 'req/set', patch: { minSf: 12000 } }))
    act(() => result.current.assistant.send('What is vacant on this date?'))
    await waitFor(() => expect(result.current.assistant.error).toBe('rate-limit'))
    expect(result.current.assistant.fallback).toBeNull()
    expect(result.current.app.state.req.minSf).toBe(12000)
  })

  it('a new message clears the fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'x' }, { status: 502 })))
    const { result } = renderAi()
    act(() => result.current.assistant.send('10k SF'))
    await waitFor(() => expect(result.current.assistant.fallback).not.toBeNull())
    act(() => result.current.assistant.send('12k SF'))
    expect(result.current.assistant.fallback).toBeNull()
  })
})
