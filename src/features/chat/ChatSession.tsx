import { useMemo } from 'react'
import { useAppState } from '../../app/state/useAppState'
import { ChatPanel } from './ChatPanel'
import { useBuildingChat } from './useBuildingChat'

type Props = { panelId: string; visible: boolean; onClose: () => void }

/**
 * Holds one building's conversation and shows it in the panel when visible. Mount it with `key={buildingId}`:
 * a building switch starts a new conversation (FR6), while a hidden panel (closed, presenting) keeps it.
 */
export function ChatSession({ panelId, visible, onClose }: Props) {
  const { state } = useAppState()
  const { buildingId, today, asOf, changes } = state
  const snapshot = useMemo(() => ({ buildingId, today, asOf, changes }), [buildingId, today, asOf, changes])
  const chat = useBuildingChat(snapshot)
  if (!visible) return null
  return (
    <ChatPanel
      id={panelId} messages={chat.messages} status={chat.status} error={chat.error} turnsLeft={chat.turnsLeft}
      onSend={(text) => void chat.send(text)} onStop={() => void chat.stop()} onRetry={() => void chat.retry()}
      onReset={chat.reset} onClose={onClose}
    />
  )
}
