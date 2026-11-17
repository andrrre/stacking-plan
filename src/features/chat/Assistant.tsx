import { useId, useMemo } from 'react'
import { horizonEnd } from '../../app/state/selectors'
import { useAppState } from '../../app/state/useAppState'
import { BUNDLED_BUILDINGS } from '../../data'
import { useChatAvailable } from './chatAvailability'
import { ChatPanel } from './ChatPanel'
import { AI_EXAMPLES, AI_INTRO, LOCAL_EXAMPLES, LOCAL_INTRO, SETUP_HINT } from './assistantCopy'
import { useAiAssistant, useLocalAssistant, type LocalReason } from './useAssistant'

function AiAssistant({ id }: { id: string }) {
  const { state } = useAppState()
  const { buildingId, today, asOf, changes } = state
  const snapshot = useMemo(() => ({ buildingId, today, asOf, changes }), [buildingId, today, asOf, changes])
  const assistant = useAiAssistant(snapshot)
  return <ChatPanel {...assistant} id={id} mode="ai" intro={AI_INTRO} examples={AI_EXAMPLES} horizon={horizonEnd(state)} />
}

function LocalAssistant({ id, reason, dev }: { id: string; reason: LocalReason; dev: boolean }) {
  const { state } = useAppState()
  const assistant = useLocalAssistant(reason, state.today)
  const intro = dev && reason === 'unavailable' ? `${LOCAL_INTRO[reason]} ${SETUP_HINT}` : LOCAL_INTRO[reason]
  return <ChatPanel {...assistant} id={id} mode="local" intro={intro} examples={LOCAL_EXAMPLES} horizon={horizonEnd(state)} />
}

/**
 * The one assistant, at the top of the left drawer. With a chat model and a bundled building it is the building
 * chat, whose searches fill the search form; otherwise (no key, the probe pending or failed, an imported building)
 * it reads requirements with the offline parser and says so. A building switch starts a new conversation; the
 * drawer stays mounted while a tour shuts it, so the conversation is still there afterwards.
 */
export function Assistant({ dev = import.meta.env.DEV }: { dev?: boolean }) {
  const { state } = useAppState()
  const available = useChatAvailable()
  const id = useId()
  const bundled = BUNDLED_BUILDINGS.some((b) => b.id === state.buildingId)
  if (bundled && available === true) return <AiAssistant key={state.buildingId} id={id} />
  const reason: LocalReason = bundled ? 'unavailable' : 'imported'
  return <LocalAssistant key={`${state.buildingId}:${reason}`} id={id} reason={reason} dev={dev} />
}
