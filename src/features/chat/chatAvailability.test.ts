import { describe, it, expect, vi } from 'vitest'
import { fetchChatAvailable } from './chatAvailability'

const answering = (response: Response) => vi.fn<typeof fetch>(async () => response)

describe('fetchChatAvailable', () => {
  it('is true only for a 200 with { available: true }, from a GET to /api/chat', async () => {
    const fetchFn = answering(Response.json({ available: true }))
    expect(await fetchChatAvailable(fetchFn)).toBe(true)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0] ?? []
    expect(url).toBe('/api/chat')
    expect(init?.method ?? 'GET').toBe('GET')
  })

  it('is false for { available: false }', async () => {
    expect(await fetchChatAvailable(answering(Response.json({ available: false })))).toBe(false)
  })

  it('is false for a 503, even with an available body', async () => {
    expect(await fetchChatAvailable(answering(Response.json({ available: true }, { status: 503 })))).toBe(false)
  })

  it('is false for a network error', async () => {
    expect(await fetchChatAvailable(vi.fn<typeof fetch>(async () => { throw new TypeError('Failed to fetch') }))).toBe(false)
  })

  it('is false for a non-JSON body', async () => {
    expect(await fetchChatAvailable(answering(new Response('<html>index</html>', { status: 200 })))).toBe(false)
  })

  it('is false for a wrong shape', async () => {
    expect(await fetchChatAvailable(answering(Response.json({ available: 'yes' })))).toBe(false)
    expect(await fetchChatAvailable(answering(Response.json(null)))).toBe(false)
    expect(await fetchChatAvailable(answering(Response.json([true])))).toBe(false)
  })
})
