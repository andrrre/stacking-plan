// Node `IncomingMessage` / `ServerResponse` <-> web `Request` / `Response`, for the local dev and preview servers.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

/** Client-supplied forwarding headers: dropped, so the rate limiter keys on the real peer and cannot be rotated. */
const FORWARDING = new Set(['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for'])

function webHeaders(req: IncomingMessage): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || name.startsWith(':') || FORWARDING.has(name)) continue
    for (const one of Array.isArray(value) ? value : [value]) headers.append(name, one)
  }
  headers.set('x-real-ip', req.socket.remoteAddress ?? 'unknown')
  return headers
}

/** The web `Request` for a Node request. The body is streamed, not buffered; GET and HEAD have none. */
export function toWebRequest(req: IncomingMessage, signal: AbortSignal): Request {
  const method = req.method ?? 'GET'
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers: webHeaders(req),
    signal,
    ...(hasBody ? { body: Readable.toWeb(req) as ReadableStream<Uint8Array>, duplex: 'half' } : {}),
  }
  return new Request(url, init)
}

function nodeHeaders(headers: Headers): Record<string, string | string[]> {
  const cookies = headers.getSetCookie()
  const rest = Object.fromEntries([...headers].filter(([name]) => name !== 'set-cookie'))
  return cookies.length > 0 ? { ...rest, 'set-cookie': cookies } : rest
}

/** Writes a web `Response` to the Node response, each body chunk as it arrives (never buffered). */
export async function sendWebResponse(response: Response, res: ServerResponse): Promise<void> {
  res.writeHead(response.status, nodeHeaders(response.headers))
  if (response.body === null) {
    res.end()
    return
  }
  const reader = response.body.getReader()
  res.once('close', () => void reader.cancel().catch(() => undefined))
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      if (res.destroyed) return
      res.write(chunk.value)
    }
    res.end()
  } catch {
    // The body stream failed after the headers went out: the only signal left is to cut the connection.
    res.destroy()
  }
}

/**
 * Runs a web handler for a Node request. The request's signal aborts when the client disconnects before the
 * response finished, so on the local dev and preview servers a closed tab or Stop cancels the model call. On Vercel
 * that relies on `supportsCancellation` in vercel.json instead (not verified until a deploy).
 */
export async function serveWeb(
  req: IncomingMessage,
  res: ServerResponse,
  handler: (request: Request) => Promise<Response>,
): Promise<void> {
  const controller = new AbortController()
  res.once('close', () => {
    if (!res.writableFinished) controller.abort()
  })
  await sendWebResponse(await handler(toWebRequest(req, controller.signal)), res)
}
