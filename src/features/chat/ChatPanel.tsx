import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { CHAT_MAX_TURNS, CHAT_MAX_USER_CHARS } from '../../shared/chat.schema'
import { isBusy, type ChatErrorKind, type ChatStatus, type PanelMessage } from './useBuildingChat'
import styles from './ChatPanel.module.css'

const EXAMPLES = [
  'What is vacant on this date?',
  'Which leases expire in the next 12 months?',
  'Where could a 10,000 SF tenant go?',
] as const

const LOOKING = 'Looking at the building…'
const NO_ANSWER = 'The AI gave no answer.'
const RATE_LIMITED = 'Too many questions. Wait a minute.'
const FAILED = 'The AI did not answer. Try again.'
const LIMIT = `This chat has reached ${CHAT_MAX_TURNS} questions. Start a new chat to ask more.`

type Props = {
  id: string
  messages: PanelMessage[]
  status: ChatStatus
  error: ChatErrorKind
  turnsLeft: number
  onSend: (text: string) => void
  onStop: () => void
  onRetry: () => void
  onReset: () => void
  onClose: () => void
}

/**
 * The finished answer, set once when a turn ends (not token by token); a stopped answer is not announced. A turn
 * can end straight from 'submitted' when the whole answer arrives in one chunk, so any busy status counts. An
 * empty conversation (New chat) clears it.
 */
function useAnnouncement(status: ChatStatus, messages: PanelMessage[]): string {
  const [prev, setPrev] = useState(status)
  const [text, setText] = useState('')
  if (messages.length === 0 && text !== '') setText('')
  if (prev !== status) {
    setPrev(status)
    const last = messages.at(-1)
    if (isBusy(prev) && status === 'ready' && last?.role === 'assistant' && !last.stopped) setText(last.text || NO_ANSWER)
  }
  return text
}

/** Focus the input on open, and again when a turn ends (Stop, which is gone by then, may have had it). */
function useInputFocus(busy: boolean, input: RefObject<HTMLTextAreaElement | null>) {
  const wasBusy = useRef(busy)
  useEffect(() => {
    input.current?.focus()
  }, [input])
  useEffect(() => {
    if (wasBusy.current && !busy) input.current?.focus()
    wasBusy.current = busy
  }, [busy, input])
}

function Message({ message }: { message: PanelMessage }) {
  const text = message.pending ? LOOKING : message.text || (message.stopped ? '' : NO_ANSWER)
  return (
    <p className={styles.message} data-testid="chat-message" data-role={message.role} data-pending={String(message.pending)}>
      {text}
      {message.stopped && <span className={styles.stopped} data-testid="chat-stopped">Stopped</span>}
    </p>
  )
}

function ChatLog({ messages, status, onSend }: Pick<Props, 'messages' | 'status' | 'onSend'>) {
  const waiting = isBusy(status) && messages.at(-1)?.role !== 'assistant'
  return (
    <div className={styles.log} role="log" aria-live="off" aria-label="Conversation" data-testid="chat-log">
      {messages.length === 0 && (
        <div className={styles.examples}>
          <p className={styles.intro}>Ask about vacancy, leases, what fits a requirement, or a suite.</p>
          {EXAMPLES.map((q) => (
            <button key={q} type="button" className={styles.example} data-testid="chat-example" onClick={() => onSend(q)}>{q}</button>
          ))}
        </div>
      )}
      {messages.map((m) => <Message key={m.id} message={m} />)}
      {waiting && <p className={styles.message} data-role="assistant" data-pending="true" data-testid="chat-pending">{LOOKING}</p>}
    </div>
  )
}

function Notice({ error, turnsLeft, onRetry }: Pick<Props, 'error' | 'turnsLeft' | 'onRetry'>) {
  if (error === 'rate-limit') return <p className={styles.error} role="alert" data-testid="chat-error" data-kind={error}>{RATE_LIMITED}</p>
  if (error === 'failed') {
    return (
      <p className={styles.error} role="alert" data-testid="chat-error" data-kind={error}>
        {FAILED}
        <button type="button" className={styles.retry} data-testid="chat-retry" onClick={onRetry}>Retry</button>
      </p>
    )
  }
  return turnsLeft <= 0 ? <p className={styles.note} data-testid="chat-limit">{LIMIT}</p> : null
}

type FormProps = Pick<Props, 'id' | 'status' | 'turnsLeft' | 'onSend' | 'onStop'> & { input: RefObject<HTMLTextAreaElement | null> }

function ChatForm({ id, status, turnsLeft, onSend, onStop, input }: FormProps) {
  const [text, setText] = useState('')
  const busy = isBusy(status)
  const full = turnsLeft <= 0
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy || full || text.trim() === '') return
    onSend(text.trim())
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
      <label htmlFor={`${id}-input`} className={styles.srOnly}>Ask about this building</label>
      <textarea
        id={`${id}-input`} ref={input} rows={2} className={styles.input} data-testid="chat-input" autoComplete="off"
        maxLength={CHAT_MAX_USER_CHARS} placeholder={full ? 'Start a new chat' : 'Ask about this building'}
        value={text} readOnly={busy} aria-busy={busy} disabled={full} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
      />
      <div className={styles.row}>
        <span className={styles.count} data-testid="chat-count">{text.length}/{CHAT_MAX_USER_CHARS}</span>
        {busy
          ? <button type="button" className={styles.stop} data-testid="chat-stop" onClick={onStop}>Stop</button>
          : <button type="submit" className={styles.send} data-testid="chat-send" disabled={full || text.trim() === ''}>Send</button>}
      </div>
    </form>
  )
}

/** The chat panel: presentational, every state comes in by props (FR11). Escape closes it and nothing else. */
export function ChatPanel(props: Props) {
  const { id, messages, status, error, turnsLeft, onRetry, onReset, onClose } = props
  const input = useRef<HTMLTextAreaElement>(null)
  const announcement = useAnnouncement(status, messages)
  useInputFocus(isBusy(status), input)
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    e.preventDefault()
    e.stopPropagation()
    onClose()
  }
  return (
    <div id={id} className={styles.panel} role="dialog" aria-label="Building chat" data-testid="chat-panel" data-print="hide" onKeyDown={onKeyDown}>
      <div className={styles.bar}>
        <span className={styles.title}>Building chat</span>
        <button type="button" className={styles.barButton} data-testid="chat-new" onClick={onReset}>New chat</button>
        <button type="button" className={styles.barButton} data-testid="chat-close" aria-label="Close chat" onClick={onClose}>Close</button>
      </div>
      <ChatLog messages={messages} status={status} onSend={props.onSend} />
      <Notice error={error} turnsLeft={turnsLeft} onRetry={onRetry} />
      <ChatForm id={id} status={status} turnsLeft={turnsLeft} onSend={props.onSend} onStop={props.onStop} input={input} />
      <p className={styles.srOnly} role="status" aria-live="polite" data-testid="chat-announce">{announcement}</p>
    </div>
  )
}
