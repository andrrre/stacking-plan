import { useId, useRef, useState } from 'react'
import { useAppState } from '../../app/state/useAppState'
import { BUNDLED_BUILDINGS } from '../../data'
import { HintButton } from '../layout/HintButton'
import { useChatAvailable } from './chatAvailability'
import { ChatSession } from './ChatSession'

export const SETUP_HINT = 'Add ANTHROPIC_API_KEY to .env and restart to turn the chat on.'
export const IMPORTED_HINT = 'Chat is off for imported buildings: their data stays in this browser.'

type Props = { className?: string; dev?: boolean }

/**
 * The header's Chat button and the panel it opens (A4, A7). Without a chat model it is hidden, or in dev a hint
 * that says how to turn it on; on an imported building it is a hint and no conversation exists, so nothing can
 * be sent. While presenting or touring nothing shows, but the conversation stays for afterwards.
 */
export function ChatLauncher({ className, dev = import.meta.env.DEV }: Props) {
  const { state } = useAppState()
  const available = useChatAvailable()
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const hidden = state.presenting || state.tour !== null
  if (available === null || (!available && !dev)) return null
  const bundled = BUNDLED_BUILDINGS.some((b) => b.id === state.buildingId)
  if (!bundled || !available) {
    if (hidden) return null
    return (
      <HintButton className={className} testId="chat-toggle" hint={bundled ? SETUP_HINT : IMPORTED_HINT} onClick={() => {}}>
        Chat
      </HintButton>
    )
  }
  const close = () => {
    setOpen(false)
    toggle.current?.focus()
  }
  return (
    <>
      {!hidden && (
        <button
          ref={toggle} type="button" className={className} data-testid="chat-toggle"
          aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}
        >
          Chat
        </button>
      )}
      <ChatSession key={state.buildingId} panelId={panelId} visible={open && !hidden} onClose={close} />
    </>
  )
}
