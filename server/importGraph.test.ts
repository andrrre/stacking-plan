// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// The Vercel entry points: everything the deployed functions import is reached from these.
const ROOTS = readdirSync(resolve(root, 'api'))
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => `api/${name}`)

interface Specifier {
  file: string
  spec: string
  statement: string
}

const STATEMENT = /^(?:import|export)\b[^;]*?\bfrom\s+'([^']+)'[^\n]*|^import\s+'([^']+)'[^\n]*/gm

function collect(): Specifier[] {
  const seen = new Set<string>()
  const found: Specifier[] = []
  const queue = [...ROOTS]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    const source = readFileSync(resolve(root, file), 'utf8')
    for (const m of source.matchAll(STATEMENT)) {
      const spec = (m[1] ?? m[2]) as string
      if (!spec.startsWith('.')) continue
      found.push({ file, spec, statement: m[0] })
      if (spec.endsWith('.js')) queue.push(resolve(dirname(file), spec.replace(/\.js$/, '.ts')).replace(`${root}/`, ''))
    }
  }
  return found
}

describe('server import graph', () => {
  const specifiers = collect()

  it('every relative import reachable from api/*.ts ends in .js or .json', () => {
    const bad = specifiers.filter((s) => !s.spec.endsWith('.js') && !s.spec.endsWith('.json'))
    expect(bad.map((s) => `${s.file}: ${s.spec}`)).toEqual([])
  })

  it('every .json import carries the type attribute', () => {
    const bad = specifiers.filter((s) => s.spec.endsWith('.json') && !/with\s*\{\s*type:\s*'json'\s*\}/.test(s.statement))
    expect(bad.map((s) => `${s.file}: ${s.spec}`)).toEqual([])
  })

  it('walks the whole graph (guards against a vacuous pass)', () => {
    expect(ROOTS).toEqual(expect.arrayContaining(['api/chat.ts', 'api/summary.ts']))
    const files = new Set(specifiers.map((s) => s.file))
    for (const reached of ['server/chat.ts', 'server/chatToolFns.ts', 'src/data/index.ts', 'src/domain/findFits.ts']) {
      expect(files).toContain(reached)
    }
  })
})
