import { useState } from 'react'
import type { ISODate } from '../../domain/types'
import { CHAT_MAX_TURNS } from '../../shared/chat.schema'
import type { ChatSnapshot } from './chatRequest'
import { localFill, type Fill } from './requirementFill'
import { useBuildingChat, type ChatErrorKind, type ChatStatus, type PanelMessage } from './useBuildingChat'
import { useRequirementApply } from './useRequirementApply'

/** Why the assistant reads requirements locally: no chat model, or an imported building (its data stays here). */
export type LocalReason = 'unavailable' | 'imported'

/** What the assistant panel needs from either mode. */
export type AssistantState = {
  messages: PanelMessage[]
  status: ChatStatus
  error: ChatErrorKind
  /** After a failed AI turn: the requirement read locally from the broker's message instead, if any. */
  fallback: Fill | null
  turnsLeft: number
  send: (text: string) => void
  stop: () => void
  retry: () => void
  reset: () => void
}

const OFF: Record<LocalReason, string> = {
  unavailable: 'AI is unavailable.',
  imported: 'AI is off for imported buildings: their data stays in this browser.',
}
export const READ_LOCALLY = 'The requirement was read locally.'
export const NOTHING_READ = 'Only a space requirement can be read here (a size, a rent, a move-in date) and none was found, '
  + 'so the search form was left as it was.'

export const localAnswer = (reason: LocalReason, found: boolean) => `${OFF[reason]} ${found ? READ_LOCALLY : NOTHING_READ}`

/**
 * Without the AI: each message goes through the offline parser. A requirement fills the search form; anything else
 * gets an honest line saying only a requirement can be read here. Nothing leaves the browser.
 */
export function useLocalAssistant(reason: LocalReason, today: ISODate): AssistantState {
  const requirement = useRequirementApply()
  const [messages, setMessages] = useState<PanelMessage[]>([])
  const send = (text: string) => {
    const read = localFill(text, today)
    requirement.begin()
    const fill = read && { ...read, applied: requirement.apply(read.parsed) }
    const row = { pending: false, stopped: false }
    setMessages((prev) => [
      ...prev,
      { ...row, id: `local-${prev.length}`, role: 'user', text: text.trim(), fill: null },
      { ...row, id: `local-${prev.length + 1}`, role: 'assistant', text: localAnswer(reason, fill !== null), fill },
    ])
  }
  const idle = () => undefined
  return {
    messages, status: 'ready', error: null, fallback: null, turnsLeft: CHAT_MAX_TURNS,
    send, stop: idle, retry: idle, reset: () => setMessages([]),
  }
}

/**
 * With the AI: the building chat, whose find_space calls fill the search form. When a turn fails, the broker's
 * message goes through the offline parser instead, so a requirement still fills the form.
 */
export function useAiAssistant(snapshot: ChatSnapshot): AssistantState {
  const requirement = useRequirementApply()
  const [fallback, setFallback] = useState<Fill | null>(null)
  const chat = useBuildingChat(snapshot, undefined, {
    onRequirement: requirement.apply,
    onFailure: (text) => {
      const read = localFill(text, snapshot.today)
      setFallback(read && { ...read, applied: requirement.apply(read.parsed) })
    },
  })
  const begin = () => {
    setFallback(null)
    requirement.begin()
  }
  return {
    ...chat,
    fallback,
    send: (text) => {
      begin()
      void chat.send(text)
    },
    stop: () => void chat.stop(),
    retry: () => {
      begin()
      void chat.retry()
    },
    reset: () => {
      setFallback(null)
      chat.reset()
    },
  }
}
