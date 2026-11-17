import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import type { ISODate } from '../../domain/types'
import { CHAT_MAX_TURNS, CHAT_MAX_USER_CHARS } from '../../shared/chat.schema'
import { FillNote } from './FillNote'
import type { AssistantState } from './useAssistant'
import { isBusy, type ChatStatus, type PanelMessage } from './useBuildingChat'
import styles from './ChatPanel.module.css'

const LOOKING = 'Looking at the building…'
const NO_ANSWER = 'The AI gave no answer.'
const RATE_LIMITED = 'Too many questions. Wait a minute.'
const FAILED = 'The AI did not answer. Try again.'
const FALLBACK = 'AI is unavailable, so the requirement was read locally.'
const LIMIT = `This chat has reached ${CHAT_MAX_TURNS} questions. Start a new chat to ask more.`
const PLACEHOLDER = 'e.g. Law firm, 9–11k SF, by Q2 next year, under $60'

type Props = AssistantState & {
  id: string
  mode: 'ai' | 'local'
  /** The empty state's line, and the questions offered there (only ones this mode can answer). */
  intro: string
  examples: readonly string[]
  /** The date slider's end, for the "beyond the 5-year view" note. */
  horizon: ISODate
}

/**
 * The finished answer, set once when a turn ends (not token by token); a stopped answer is not announced. A turn
 * can end straight from 'submitted' when the whole answer arrives in one chunk, so any busy status counts. An
 * empty conversation (New chat) clears it. A local answer (never busy) is announced when it is added.
 */
function useAnnouncement(status: ChatStatus, messages: PanelMessage[]): string {
  const [prev, setPrev] = useState({ status, count: messages.length })
  const [text, setText] = useState('')
  if (messages.length === 0 && text !== '') setText('')
  if (prev.status !== status || prev.count !== messages.length) {
    setPrev({ status, count: messages.length })
    const last = messages.at(-1)
    const ended = isBusy(prev.status) ? status === 'ready' : status === 'ready' && messages.length > prev.count
    if (ended && last?.role === 'assistant' && !last.stopped) setText(last.text || NO_ANSWER)
  }
  return text
}

/**
 * When a turn ends, focus goes back to the input (Stop, which is gone by then, may have had it), unless the broker
 * has moved on to something outside the assistant.
 */
function useInputFocus(busy: boolean, input: RefObject<HTMLTextAreaElement | null>, panel: RefObject<HTMLElement | null>) {
  const wasBusy = useRef(busy)
  useEffect(() => {
    const active = document.activeElement
    const ours = active === null || active === document.body || panel.current?.contains(active) === true
    if (wasBusy.current && !busy && ours) input.current?.focus()
    wasBusy.current = busy
  }, [busy, input, panel])
}

/** Keeps the newest message in view while the log scrolls inside the drawer. */
function useScrollToEnd(messages: PanelMessage[]): RefObject<HTMLDivElement | null> {
  const log = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }, [messages])
  return log
}

function Message({ message, horizon }: { message: PanelMessage; horizon: ISODate }) {
  const text = message.pending ? LOOKING : message.text || (message.stopped ? '' : NO_ANSWER)
  return (
    <div className={styles.message} data-testid="chat-message" data-role={message.role} data-pending={String(message.pending)}>
      <p className={styles.text} data-testid="chat-text">{text}</p>
      {message.stopped && <span className={styles.stopped} data-testid="chat-stopped">Stopped</span>}
      {message.fill && <FillNote fill={message.fill} horizon={horizon} />}
    </div>
  )
}

type LogProps = Pick<Props, 'messages' | 'status' | 'send' | 'intro' | 'examples' | 'horizon'>

function ChatLog({ messages, status, send, intro, examples, horizon }: LogProps) {
  const log = useScrollToEnd(messages)
  const waiting = isBusy(status) && messages.at(-1)?.role !== 'assistant'
  return (
    <div ref={log} className={styles.log} role="log" aria-live="off" aria-label="Conversation" data-testid="chat-log">
      {messages.length === 0 && (
        <div className={styles.examples}>
          <p className={styles.intro} data-testid="chat-intro">{intro}</p>
          {examples.map((q) => (
            <button key={q} type="button" className={styles.example} data-testid="chat-example" onClick={() => send(q)}>{q}</button>
          ))}
        </div>
      )}
      {messages.map((m) => <Message key={m.id} message={m} horizon={horizon} />)}
      {waiting && <p className={styles.waiting} data-role="assistant" data-pending="true" data-testid="chat-pending">{LOOKING}</p>}
    </div>
  )
}

function Notice({ error, turnsLeft, retry, fallback, horizon }: Pick<Props, 'error' | 'turnsLeft' | 'retry' | 'fallback' | 'horizon'>) {
  if (error === null) return turnsLeft <= 0 ? <p className={styles.note} data-testid="chat-limit">{LIMIT}</p> : null
  return (
    <div className={styles.notice}>
      <p className={styles.error} role="alert" data-testid="chat-error" data-kind={error}>
        {error === 'rate-limit' ? RATE_LIMITED : FAILED}
        {error === 'failed' && <button type="button" className={styles.retry} data-testid="chat-retry" onClick={retry}>Retry</button>}
      </p>
      {fallback && (
        <div className={styles.fallback} data-testid="chat-fallback">
          <p className={styles.text}>{FALLBACK}</p>
          <FillNote fill={fallback} horizon={horizon} />
        </div>
      )}
    </div>
  )
}

type FormProps = Pick<Props, 'id' | 'status' | 'turnsLeft' | 'send' | 'stop'> & {
  input: RefObject<HTMLTextAreaElement | null>; text: string; setText: (text: string) => void
}

function ChatForm({ id, status, turnsLeft, send, stop, input, text, setText }: FormProps) {
  const busy = isBusy(status)
  const full = turnsLeft <= 0
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy || full || text.trim() === '') return
    send(text.trim())
    setText('')
  }
  // Enter sends; Shift+Enter is a new line; an IME composition keeps its Enter.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    e.currentTarget.form?.requestSubmit()
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor={`${id}-input`} className={styles.srOnly}>Describe a requirement or ask about this building</label>
      <textarea
        id={`${id}-input`} ref={input} rows={2} className={styles.input} data-testid="chat-input" autoComplete="off"
        maxLength={CHAT_MAX_USER_CHARS} placeholder={full ? 'Start a new chat' : PLACEHOLDER}
        value={text} readOnly={busy} aria-busy={busy} disabled={full} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
      />
      <div className={styles.row}>
        <span className={styles.count} data-testid="chat-count">{text.length}/{CHAT_MAX_USER_CHARS}</span>
        {busy
          ? <button type="button" className={styles.stop} data-testid="chat-stop" onClick={stop}>Stop</button>
          : <button type="submit" className={styles.send} data-testid="chat-send" disabled={full || text.trim() === ''}>Send</button>}
      </div>
    </form>
  )
}

/** The assistant at the top of the left drawer: presentational, every state comes in by props (FR11). */
export function ChatPanel(props: Props) {
  const { id, mode, messages, status, reset } = props
  const panel = useRef<HTMLElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const announcement = useAnnouncement(status, messages)
  useInputFocus(isBusy(status), input, panel)
  // The live region exists from the first keystroke of a conversation, so its first answer is announced; with no
  // conversation it is left out, so the drawer has no empty status besides the form's own.
  const live = messages.length > 0 || text !== ''
  return (
    <section ref={panel} id={id} className={styles.panel} aria-label="Assistant" data-testid="chat-panel" data-mode={mode}>
      <div className={styles.bar}>
        <h2 className={styles.title}>Assistant</h2>
        {messages.length > 0 && <button type="button" className={styles.barButton} data-testid="chat-new" onClick={reset}>New chat</button>}
      </div>
      <ChatLog {...props} />
      <Notice {...props} />
      <ChatForm {...props} input={input} text={text} setText={setText} />
      {live && <p className={styles.srOnly} role="status" aria-live="polite" data-testid="chat-announce">{announcement}</p>}
    </section>
  )
}
