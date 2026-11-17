// @vitest-environment node
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServerEnv } from '../model.js'
import { API_ROUTES, apiMiddleware, type RouteTable } from './apiPlugin.js'

let server: Server | undefined

afterEach(async () => {
  const s = server
  server = undefined
  if (s) await new Promise<void>((done) => s.close(() => done()))
})

/** A real Node server running only the middleware; `next()` answers 299 so the test can see it was called. */
async function listen(routes: RouteTable, env: ServerEnv): Promise<{ base: string; next: ReturnType<typeof vi.fn> }> {
  const next = vi.fn()
  const middleware = apiMiddleware(routes, env)
  const s = createServer((req, res) =>
    middleware(req, res, () => {
      next()
      res.writeHead(299).end('next')
    }),
  )
  server = s
  await new Promise<void>((done) => s.listen(0, '127.0.0.1', () => done()))
  return { base: `http://127.0.0.1:${(s.address() as AddressInfo).port}`, next }
}

const ok = async () => Response.json({ ok: true })

describe('apiMiddleware', () => {
  it('a path outside /api calls next()', async () => {
    const { base, next } = await listen({ '/api/x': { POST: ok } }, {})
    const res = await fetch(`${base}/assets/app.js`)
    expect(res.status).toBe(299)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('an unknown /api path answers 404 JSON instead of falling through to the SPA', async () => {
    const { base, next } = await listen({ '/api/x': { POST: ok } }, {})
    const res = await fetch(`${base}/api/nope`, { method: 'POST' })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Request failed' })
    expect(next).not.toHaveBeenCalled()
  })

  it('a known path with a wrong method answers 405 JSON with Allow', async () => {
    const { base, next } = await listen({ '/api/x': { POST: ok } }, {})
    const res = await fetch(`${base}/api/x`)
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
    expect(await res.json()).toEqual({ error: 'Request failed' })
    expect(next).not.toHaveBeenCalled()
  })

  it('does not treat Object prototype keys as routes', async () => {
    const { base } = await listen({ '/api/x': { POST: ok } }, {})
    expect((await fetch(`${base}/api/__proto__`)).status).toBe(404)
    expect((await fetch(`${base}/api/constructor`)).status).toBe(404)
  })

  it('matches the exact pathname, ignoring the query string', async () => {
    const { base } = await listen({ '/api/x': { POST: ok } }, {})
    const res = await fetch(`${base}/api/x?debug=1`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('the handler receives the env object given to the factory', async () => {
    const env: ServerEnv = { ANTHROPIC_API_KEY: 'k', AI_MODEL: 'm' }
    const handler = vi.fn(async (_request: Request, got: ServerEnv) => Response.json({ same: got === env }))
    const { base } = await listen({ '/api/x': { POST: handler } }, env)
    const res = await fetch(`${base}/api/x`, { method: 'POST' })
    expect(await res.json()).toEqual({ same: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('a handler that throws answers 500 { error: "Request failed" } and logs one line without the key', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const boom = async (): Promise<Response> => {
      throw new Error('secret detail sk-dev-key')
    }
    const { base } = await listen({ '/api/x': { POST: boom } }, { ANTHROPIC_API_KEY: 'sk-dev-key' })
    const res = await fetch(`${base}/api/x`, { method: 'POST' })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Request failed' })
    expect(spy.mock.calls).toEqual([['[ai:x] Error: secret detail [key]']])
    spy.mockRestore()
  })

  it('the real table serves POST /api/summary, GET and POST /api/chat, and only the routes that exist', () => {
    expect(Object.keys(API_ROUTES).sort()).toEqual(['/api/chat', '/api/summary'])
    expect(Object.keys(API_ROUTES['/api/summary'] ?? {})).toEqual(['POST'])
    expect(Object.keys(API_ROUTES['/api/chat'] ?? {}).sort()).toEqual(['GET', 'POST'])
  })

  it('GET /api/chat with the real table and no key answers { available: false }', async () => {
    const { base } = await listen(API_ROUTES, { ANTHROPIC_API_KEY: '' })
    const res = await fetch(`${base}/api/chat`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ available: false })
  })
})
