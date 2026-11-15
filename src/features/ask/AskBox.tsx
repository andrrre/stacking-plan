import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { horizonEnd } from '../../app/state/selectors'
import { useAppState } from '../../app/state/useAppState'
import { formatLongDate, formatMonthYear, formatNumber, formatPsf } from '../../domain/format'
import type { ISODate, ParsedQuery } from '../../domain/types'
import { askService, type AskResult } from './askService'
import styles from './AskBox.module.css'

const MAX_CHARS = 500
const PLACEHOLDER = 'e.g. Law firm, 9–11k SF, by Q2 next year, under $60'

function sizeText({ minSf, maxSf }: ParsedQuery): string | null {
  if (minSf !== undefined && maxSf !== undefined) return `${formatNumber(minSf)}–${formatNumber(maxSf)} SF`
  if (minSf !== undefined) return `at least ${formatNumber(minSf)} SF`
  if (maxSf !== undefined) return `up to ${formatNumber(maxSf)} SF`
  return null
}

/** What was understood, in the words the form and slider use. */
function understood(p: ParsedQuery): string[] {
  return [
    sizeText(p),
    p.maxRentPsf !== undefined ? `rent up to ${formatPsf(p.maxRentPsf)}/SF` : null,
    p.moveInBy !== undefined ? `move in by ${formatLongDate(p.moveInBy)}` : null,
  ].filter((s): s is string => s !== null)
}

function warnings(p: ParsedQuery, horizon: ISODate): string[] {
  const size = p.minSf !== undefined ? null
    : p.maxSf !== undefined ? 'Minimum size not understood: enter one below to search.'
      : 'Size not understood: enter a minimum size below to search.'
  const late = p.moveInBy !== undefined && p.moveInBy > horizon
    ? `Move-in date is beyond the 5-year view; showing ${formatMonthYear(horizon)}.`
    : null
  return [size, late].filter((s): s is string => s !== null)
}

const EDITED = 'The form was edited while reading, so it was left as you typed it.'
const FAILED = 'Could not read that. Fill in the fields below.'

type Outcome = { result: AskResult | null; note: string | null }

function AskOutcome({ outcome: { result, note }, horizon }: { outcome: Outcome; horizon: ISODate }) {
  const notes = [...(note ? [note] : []), ...(result ? warnings(result.parsed, horizon) : [])]
  const parts = result ? understood(result.parsed) : []
  return (
    <div className={styles.outcome} role="status" aria-live="polite">
      {result && (
        <p className={styles.understood} data-testid="ask-understood">
          {parts.length === 0 ? 'Nothing understood' : parts.map((part, i) => (
            <span key={part} className={styles.part}>{part}{i < parts.length - 1 && <span aria-hidden="true"> ·</span>}</span>
          ))}
        </p>
      )}
      {notes.map((n) => <p key={n} className={styles.warning} data-testid="ask-warning">{n}</p>)}
      {result && (
        <p className={styles.source} data-testid="ask-status">
          {result.source === 'offline' ? 'Offline parsing' : 'Read by AI'} · check the fields below
        </p>
      )}
    </div>
  )
}

/** Runs one request at a time. A requirement the broker edited while it was pending is never overwritten. */
function useAsk() {
  const { state, dispatch } = useAppState()
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const latest = useRef(0)
  const currentReq = useRef(state.req)
  useEffect(() => {
    currentReq.current = state.req
  }, [state.req])

  const submit = async (text: string) => {
    const call = (latest.current += 1)
    const reqAtSubmit = state.req
    setBusy(true)
    try {
      const result = await askService(text, state.today)
      if (call !== latest.current) return
      const edited = currentReq.current !== reqAtSubmit
      setOutcome({ result, note: edited ? EDITED : null })
      if (!edited) dispatch({ type: 'ask/apply', parsed: result.parsed })
    } catch {
      if (call === latest.current) setOutcome({ result: null, note: FAILED })
    } finally {
      if (call === latest.current) setBusy(false)
    }
  }
  return { busy, outcome, submit, horizon: horizonEnd(state) }
}

/** Plain-words requirement → structured fields that fill the requirement form. Never picks suites. */
export function AskBox() {
  const id = useId()
  const [text, setText] = useState('')
  const { busy, outcome, submit, horizon } = useAsk()

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!busy && text.trim() !== '') void submit(text)
  }

  // Enter submits; Shift+Enter is a new line.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    e.currentTarget.form?.requestSubmit()
  }

  return (
    <form className={styles.box} aria-label="Ask in plain words" aria-busy={busy} onSubmit={onSubmit}>
      <label htmlFor={`${id}-ask`} className={styles.label}>Describe the requirement</label>
      <textarea
        id={`${id}-ask`} rows={3} className={styles.input} data-testid="ask-input" autoComplete="off"
        maxLength={MAX_CHARS} placeholder={PLACEHOLDER} value={text}
        onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
      />
      <div className={styles.row}>
        <span className={styles.hint}>Enter to read it into the form</span>
        <button type="submit" className={styles.submit} data-testid="ask-submit" disabled={busy || text.trim() === ''}>
          {busy ? 'Reading…' : 'Ask'}
        </button>
      </div>
      {outcome && <AskOutcome outcome={outcome} horizon={horizon} />}
    </form>
  )
}
