// @vitest-environment node
import { createServer, request as httpRequest, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { serveWeb } from './nodeAdapter.js'

type WebHandler = (request: Request) => Promise<Response>

let server: Server | undefined

afterEach(async () => {
  const s = server
  server = undefined
  if (s) await new Promise<void>((done) => s.close(() => done()))
})

/** A real Node server on a free port that answers every request through `serveWeb`. */
async function listen(handler: WebHandler): Promise<string> {
  const s = createServer((req, res) => void serveWeb(req, res, handler))
  server = s
  await new Promise<void>((done) => s.listen(0, '127.0.0.1', () => done()))
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`
}

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('toWebRequest (through serveWeb)', () => {
  it('carries method, path, query, headers and a body readable once as text', async () => {
    const seen = deferred<{ method: string; url: string; custom: string | null; type: string | null; body: string }>()
    const base = await listen(async (request) => {
      seen.resolve({
        method: request.method,
        url: request.url,
        custom: request.headers.get('x-custom'),
        type: request.headers.get('content-type'),
        body: await request.text(),
      })
      return new Response('ok')
    })
    await fetch(`${base}/api/ask?a=1&b=two`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-custom': 'yes' },
      body: '{"query":"10k"}',
    })
    const got = await seen.promise
    expect(got.method).toBe('POST')
    expect(new URL(got.url).pathname).toBe('/api/ask')
    expect(new URL(got.url).search).toBe('?a=1&b=two')
    expect(got.custom).toBe('yes')
    expect(got.type).toBe('application/json')
    expect(got.body).toBe('{"query":"10k"}')
  })

  it('a GET request has no body', async () => {
    const seen = deferred<ReadableStream | null>()
    const base = await listen(async (request) => {
      seen.resolve(request.body)
      return new Response('ok')
    })
    await fetch(`${base}/x`)
    expect(await seen.promise).toBeNull()
  })

  it('drops client forwarding headers and sets x-real-ip to the socket address', async () => {
    const seen = deferred<Headers>()
    const base = await listen(async (request) => {
      seen.resolve(request.headers)
      return new Response('ok')
    })
    await fetch(`${base}/x`, {
      headers: { 'x-forwarded-for': '203.0.113.9', 'x-vercel-forwarded-for': '203.0.113.8', 'x-real-ip': '203.0.113.7' },
    })
    const headers = await seen.promise
    expect(headers.get('x-forwarded-for')).toBeNull()
    expect(headers.get('x-vercel-forwarded-for')).toBeNull()
    expect(headers.get('x-real-ip')).toBe('127.0.0.1')
  })
})

describe('sendWebResponse (through serveWeb)', () => {
  it('writes status, headers and body', async () => {
    const base = await listen(async () =>
      Response.json({ error: 'AI unavailable' }, { status: 503, headers: { 'x-extra': 'v' } }),
    )
    const res = await fetch(`${base}/x`)
    expect(res.status).toBe(503)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('x-extra')).toBe('v')
    expect(await res.json()).toEqual({ error: 'AI unavailable' })
  })

  it('streams chunk by chunk: the first chunk arrives before the second is enqueued', async () => {
    const gate = deferred()
    const encoder = new TextEncoder()
    const base = await listen(async () => {
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('data: one\n\n'))
          await gate.promise
          controller.enqueue(encoder.encode('data: two\n\n'))
          controller.close()
        },
      })
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    })
    const res = await fetch(`${base}/x`)
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    const decoder = new TextDecoder()
    const first = await reader.read()
    expect(decoder.decode(first.value)).toBe('data: one\n\n')
    gate.resolve()
    let rest = ''
    for (let c = await reader.read(); !c.done; c = await reader.read()) rest += decoder.decode(c.value)
    expect(rest).toBe('data: two\n\n')
  })

  it('closing the client connection mid-stream aborts the request signal', async () => {
    const aborted = deferred()
    const firstSent = deferred()
    const base = await listen(async (request) => {
      request.signal.addEventListener('abort', () => aborted.resolve())
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: one\n\n'))
          firstSent.resolve()
        },
      })
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    })
    const req = httpRequest(`${base}/x`, (res) => res.once('data', () => req.destroy()))
    req.on('error', () => undefined)
    req.end()
    await firstSent.promise
    await expect(Promise.race([aborted.promise.then(() => 'aborted'), new Promise((r) => setTimeout(r, 2000, 'timeout'))])).resolves.toBe('aborted')
  })
})
