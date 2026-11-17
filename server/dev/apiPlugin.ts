// Vite plugin: serves the /api/* handlers under `vite` (dev) and `vite preview`, with the env from `.env`.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv, type Connect, type Plugin } from 'vite'
import { handleChat, handleChatStatus } from '../chat.js'
import { jsonError } from '../http.js'
import { logAiError } from '../log.js'
import type { ServerEnv } from '../model.js'
import { handleSummary } from '../summary.js'
import { sendWebResponse, serveWeb } from './nodeAdapter.js'

export type ApiHandler = (request: Request, env: ServerEnv) => Promise<Response>
export type RouteTable = Readonly<Record<string, Readonly<Record<string, ApiHandler>>>>

/** One line per route: path -> { METHOD: handler }. */
export const API_ROUTES: RouteTable = {
  '/api/summary': { POST: handleSummary },
  '/api/chat': { GET: handleChatStatus, POST: handleChat },
}

function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined
}

function fail(res: ServerResponse): void {
  if (res.headersSent) res.destroy()
  else void sendWebResponse(jsonError(500), res)
}

/**
 * Matches the exact pathname. Outside /api → `next()`; an unknown /api path → 404 JSON (not the SPA fallback);
 * a known path with another method → 405 JSON. A thrown error → 500 `{ "error": "Request failed" }` and one log line.
 */
export function apiMiddleware(routes: RouteTable, env: ServerEnv): Connect.NextHandleFunction {
  return (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    const route = own(routes, path)
    if (!route) {
      if (path === '/api' || path.startsWith('/api/')) void sendWebResponse(jsonError(404), res)
      else next()
      return
    }
    const handler = own(route, req.method ?? '')
    if (!handler) {
      const response = jsonError(405)
      response.headers.set('allow', Object.keys(route).join(', '))
      void sendWebResponse(response, res)
      return
    }
    serveWeb(req, res, (request) => handler(request, env)).catch((error: unknown) => {
      logAiError(path.slice('/api/'.length), error, env)
      fail(res)
    })
  }
}

/** The env is loaded once per config (`process.env` wins over `.env`) and only ever handed to the handlers. */
export function apiPlugin(routes: RouteTable = API_ROUTES): Plugin {
  let env: ServerEnv = {}
  return {
    name: 'stackmatch-api',
    configResolved(config) {
      env = loadEnv(config.mode, config.envDir, '')
    },
    configureServer(server) {
      server.middlewares.use(apiMiddleware(routes, env))
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiMiddleware(routes, env))
    },
  }
}
