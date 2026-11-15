// Fixed-window limit per client key. Per instance only: serverless instances do not share it (DESIGN §6.6, "simple").
// Memory is bounded: at most RATE_LIMIT_KEYS keys, oldest evicted first, expired windows pruned once per window.
// The map is private module state and is updated in place on purpose: copying it per request would cost O(n).

const LIMIT = 10
const WINDOW_MS = 60_000
export const RATE_LIMIT_KEYS = 5_000

type Window = { start: number; count: number }

const windows = new Map<string, Window>()
let lastPrune = 0

/** Number of keys held; exported for tests. */
export function trackedKeys(): number {
  return windows.size
}

/** Expands "::" and returns the first four hextets ("2001:db8:aa:bb"), or null when not IPv6. */
function ipv6Prefix64(ip: string): string | null {
  const [head = '', tail, extra] = ip.split('%')[0]?.split('::') ?? []
  if (extra !== undefined) return null
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const fill = tail === undefined ? [] : Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0')
  const groups = [...left, ...fill, ...right]
  if (groups.length < 4 || !groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g) || g.includes('.'))) return null
  return groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':')
}

/** IPv4 as is (also when IPv4-mapped), IPv6 by its /64: one host usually owns a whole /64. */
export function rateKey(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (mapped?.[1]) return mapped[1]
  if (!ip.includes(':')) return ip
  const prefix = ipv6Prefix64(ip)
  return prefix ? `${prefix}::/64` : ip
}

function prune(nowMs: number): void {
  if (nowMs - lastPrune < WINDOW_MS) return
  lastPrune = nowMs
  for (const [key, w] of windows) if (nowMs - w.start >= WINDOW_MS) windows.delete(key)
}

function evictOldest(): void {
  const oldest = windows.keys().next()
  if (!oldest.done) windows.delete(oldest.value)
}

/** true when `ip` may make another request at `nowMs` (10 per 60 s). */
export function allow(ip: string, nowMs: number): boolean {
  prune(nowMs)
  const key = rateKey(ip)
  const current = windows.get(key)
  if (current && nowMs - current.start < WINDOW_MS) {
    windows.set(key, { ...current, count: current.count + 1 })
    return current.count + 1 <= LIMIT
  }
  windows.delete(key) // a fresh window moves the key to the newest end of the insertion order
  if (windows.size >= RATE_LIMIT_KEYS) evictOldest()
  windows.set(key, { start: nowMs, count: 1 })
  return true
}
