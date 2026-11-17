import { useEffect, useState } from 'react'

const CHAT_API = '/api/chat'

/** Whether the server has a chat model: GET /api/chat → { available: true }. Any failure counts as no. */
export async function fetchChatAvailable(fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchFn(CHAT_API, { method: 'GET' })
    if (!res.ok) return false
    const body: unknown = await res.json()
    return typeof body === 'object' && body !== null && (body as { available?: unknown }).available === true
  } catch {
    return false
  }
}

/** One probe on mount; null until it answers. */
export function useChatAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    void fetchChatAvailable((input, init) => fetch(input, init)).then((ok) => {
      if (live) setAvailable(ok)
    })
    return () => {
      live = false
    }
  }, [])
  return available
}
