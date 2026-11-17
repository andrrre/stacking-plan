import { BUNDLED_BUILDINGS } from '../src/data/index.js'
import { applyScenario } from '../src/domain/scenario.js'
import type { Building, ISODate } from '../src/domain/types.js'
import type { ChatRequest } from '../src/shared/chat.schema.js'

/** What every chat tool computes on: the bundled building with the what-if changes applied, at `asOf`. */
export type ChatContext = { building: Building; today: ISODate; asOf: ISODate; scenario: boolean }

export type ChatContextResult = { ok: true; context: ChatContext } | { ok: false; error: string }

type Snapshot = Pick<ChatRequest, 'buildingId' | 'today' | 'asOf' | 'changes'>

/**
 * Resolves the request's building from the bundled set only (never from client data) and applies the scenario.
 * Unlike the client's selectBuilding it does not fall back to the base when a change fails: the caller answers 400.
 */
export function chatContext(req: Snapshot): ChatContextResult {
  const base = BUNDLED_BUILDINGS.find((b) => b.id === req.buildingId)
  if (!base) return { ok: false, error: 'Unknown building.' }
  const applied = applyScenario(base, req.changes)
  if (!applied.ok) return { ok: false, error: applied.error.message }
  return {
    ok: true,
    context: { building: applied.building, today: req.today, asOf: req.asOf, scenario: req.changes.length > 0 },
  }
}
