import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CHAT_MAX_TURNS } from '../../shared/chat.schema'
import { AI_EXAMPLES, LOCAL_EXAMPLES } from './assistantCopy'
import { ChatPanel } from './ChatPanel'
import type { Fill } from './requirementFill'
import type { ChatErrorKind, ChatStatus, PanelMessage } from './useBuildingChat'

type Overrides = Partial<{
  messages: PanelMessage[]
  status: ChatStatus
  error: ChatErrorKind
  turnsLeft: number
  fallback: Fill | null
  mode: 'ai' | 'local'
  examples: readonly string[]
}>

function handlers() {
  return { send: vi.fn(), stop: vi.fn(), retry: vi.fn(), reset: vi.fn() }
}

function props(over: Overrides = {}, h = handlers()) {
  return {
    id: 'chat-panel', mode: 'ai' as const, intro: 'Describe a requirement.', examples: AI_EXAMPLES, horizon: '2031-11-15',
    messages: [], status: 'ready' as ChatStatus, error: null, fallback: null, turnsLeft: CHAT_MAX_TURNS, ...over, ...h,
  }
}

function renderPanel(over: Overrides = {}) {
  const h = handlers()
  const view = render(<ChatPanel {...props(over, h)} />)
  const panel = screen.getByTestId('chat-panel')
  return { ...h, ...view, panel, rerenderWith: (next: Overrides) => view.rerender(<ChatPanel {...props(next, h)} />) }
}

const msg = (id: string, role: PanelMessage['role'], text: string, extra: Partial<PanelMessage> = {}): PanelMessage =>
  ({ id, role, text, pending: false, stopped: false, fill: null, ...extra })

const Q = msg('u1', 'user', 'What is vacant today?')
const A = msg('a1', 'assistant', 'Vacant is 38,150 SF on 15 Nov 2026.')
const AI_FILL: Fill = { parsed: { minSf: 9000, maxSf: 11000, maxRentPsf: 60, moveInBy: '2027-06-30' }, source: 'ai', applied: true }

describe('ChatPanel', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is a section named Assistant (not a dialog) with a log and a labelled input', () => {
    const { panel } = renderPanel()
    expect(panel.tagName).toBe('SECTION')
    expect(panel).not.toHaveAttribute('role', 'dialog')
    expect(panel).toHaveAccessibleName('Assistant')
    expect(within(panel).getByTestId('chat-input')).toHaveAccessibleName('Describe a requirement or ask about this building')
    const log = within(panel).getByTestId('chat-log')
    expect(log).toHaveAttribute('role', 'log')
    expect(log).toHaveAttribute('aria-live', 'off')
  })

  it('the empty state shows three examples; clicking one sends its text', async () => {
    const { panel, send } = renderPanel()
    const examples = within(panel).getAllByTestId('chat-example')
    expect(examples.map((e) => e.textContent)).toEqual([
      'What is vacant on this date?', 'Which leases expire in the next 12 months?', 'Where could a 10,000 SF tenant go?',
    ])
    await userEvent.click(within(panel).getByRole('button', { name: 'What is vacant on this date?' }))
    expect(send).toHaveBeenCalledWith('What is vacant on this date?')
  })

  it('offline, only the requirement example is offered, with the intro the mode gives', () => {
    const { panel } = renderPanel({ mode: 'local', examples: LOCAL_EXAMPLES })
    expect(panel).toHaveAttribute('data-mode', 'local')
    expect(within(panel).getAllByTestId('chat-example').map((e) => e.textContent)).toEqual(['Where could a 10,000 SF tenant go?'])
    expect(within(panel).getByTestId('chat-intro')).toHaveTextContent('Describe a requirement.')
  })

  it('an answer that filled the form shows what it put there, read by AI', () => {
    const { panel } = renderPanel({ messages: [Q, msg('a1', 'assistant', 'Three options fit.', { fill: AI_FILL })] })
    const row = within(panel).getAllByTestId('chat-message')[1] as HTMLElement
    expect(within(row).getByTestId('chat-text')).toHaveTextContent('Three options fit.')
    const understood = within(row).getByTestId('ask-understood')
    for (const part of ['9,000–11,000 SF', 'rent up to $60.00/SF', 'move in by 30 Jun 2027']) expect(understood).toHaveTextContent(part)
    expect(within(row).getByTestId('ask-status')).toHaveTextContent('Read by AI · check the fields below')
    expect(within(row).queryByTestId('ask-warning')).toBeNull()
  })

  it('an offline fill says so; an unapplied one says the form was left as typed; a missing size is flagged', () => {
    const offline: Fill = { parsed: { moveInBy: '2027-06-30' }, source: 'offline', applied: false }
    const { panel } = renderPanel({ messages: [Q, msg('a1', 'assistant', 'AI is unavailable.', { fill: offline })] })
    expect(within(panel).getByTestId('ask-status')).toHaveTextContent('Offline parsing · check the fields below')
    expect(within(panel).getAllByTestId('ask-warning').map((w) => w.textContent)).toEqual([
      'The form was edited while reading, so it was left as you typed it.',
      'Size not understood: enter a minimum size below to search.',
    ])
  })

  it('a failed turn with a fallback shows the error and the requirement read locally', () => {
    const fallback: Fill = { parsed: { minSf: 10000 }, source: 'offline', applied: true }
    const { panel } = renderPanel({ messages: [Q], status: 'error', error: 'failed', fallback })
    expect(within(panel).getByTestId('chat-error')).toHaveTextContent('The AI did not answer. Try again.')
    const block = within(panel).getByTestId('chat-fallback')
    expect(block).toHaveTextContent('AI is unavailable, so the requirement was read locally.')
    expect(within(block).getByTestId('ask-understood')).toHaveTextContent('at least 10,000 SF')
    expect(within(block).getByTestId('ask-status')).toHaveTextContent('Offline parsing')
  })

  it('New chat shows only once there is a conversation', () => {
    const { panel, rerenderWith } = renderPanel()
    expect(within(panel).queryByTestId('chat-new')).toBeNull()
    rerenderWith({ messages: [Q, A] })
    expect(within(panel).getByTestId('chat-new')).toBeVisible()
  })

  it('announces a local answer when it is added (a local turn is never busy)', () => {
    const { panel, rerenderWith } = renderPanel({ mode: 'local' })
    rerenderWith({ mode: 'local', messages: [Q, msg('a1', 'assistant', 'AI is unavailable. The requirement was read locally.')] })
    expect(within(panel).getByTestId('chat-announce')).toHaveTextContent('AI is unavailable. The requirement was read locally.')
  })

  it('hides the examples once the conversation has started', () => {
    const { panel } = renderPanel({ messages: [Q, A] })
    expect(within(panel).queryByTestId('chat-example')).toBeNull()
  })

  it('Enter sends and clears the input; Shift+Enter is a new line', async () => {
    const { panel, send } = renderPanel()
    const input = within(panel).getByTestId('chat-input')
    await userEvent.type(input, 'Line one{Shift>}{Enter}{/Shift}line two')
    expect(send).not.toHaveBeenCalled()
    expect(input).toHaveValue('Line one\nline two')
    await userEvent.type(input, '{Enter}')
    expect(send).toHaveBeenCalledWith('Line one\nline two')
    expect(input).toHaveValue('')
  })

  it('the Send button sends the trimmed text', async () => {
    const { panel, send } = renderPanel()
    await userEvent.type(within(panel).getByTestId('chat-input'), '  Vacant?  ')
    await userEvent.click(within(panel).getByTestId('chat-send'))
    expect(send).toHaveBeenCalledWith('Vacant?')
  })

  it('does not send an empty or whitespace-only input', async () => {
    const { panel, send } = renderPanel()
    const input = within(panel).getByTestId('chat-input')
    await userEvent.type(input, '{Enter}')
    await userEvent.type(input, '   {Enter}')
    expect(send).not.toHaveBeenCalled()
    expect(within(panel).getByTestId('chat-send')).toBeDisabled()
  })

  it('shows a 0/500 counter and limits the input to 500 characters', async () => {
    const { panel } = renderPanel()
    const input = within(panel).getByTestId('chat-input')
    expect(within(panel).getByTestId('chat-count')).toHaveTextContent('0/500')
    expect(input).toHaveAttribute('maxlength', '500')
    await userEvent.type(input, 'abc')
    expect(within(panel).getByTestId('chat-count')).toHaveTextContent('3/500')
  })

  it('busy: Stop replaces Send and the input is read-only and busy, not disabled', async () => {
    const { panel, stop } = renderPanel({ messages: [Q], status: 'submitted' })
    expect(within(panel).queryByTestId('chat-send')).toBeNull()
    const input = within(panel).getByTestId('chat-input')
    expect(input).toHaveAttribute('readonly')
    expect(input).toHaveAttribute('aria-busy', 'true')
    expect(input).toBeEnabled()
    expect(within(panel).getByTestId('chat-pending')).toHaveTextContent('Looking at the building…')
    await userEvent.click(within(panel).getByTestId('chat-stop'))
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('a running tool part with no text shows "Looking at the building…"', () => {
    const { panel } = renderPanel({ messages: [Q, msg('a1', 'assistant', '', { pending: true })], status: 'streaming' })
    const rows = within(panel).getAllByTestId('chat-message')
    expect(rows[1]).toHaveTextContent('Looking at the building…')
    expect(within(panel).queryByTestId('chat-pending')).toBeNull()
  })

  it('an answer that finished with no text says so', () => {
    const { panel } = renderPanel({ messages: [Q, msg('a1', 'assistant', '')] })
    expect(within(panel).getAllByTestId('chat-message')[1]).toHaveTextContent('The AI gave no answer.')
  })

  it('keeps focus in the input for the whole turn; typing and Enter do nothing while busy (FR14)', async () => {
    const { panel, send, rerenderWith } = renderPanel()
    const input = within(panel).getByTestId('chat-input')
    await userEvent.type(input, 'Vacant?{Enter}')
    expect(send).toHaveBeenCalledTimes(1)
    rerenderWith({ messages: [msg('u1', 'user', 'Vacant?')], status: 'submitted' })
    expect(document.activeElement).toBe(input)
    await userEvent.keyboard('more{Enter}')
    rerenderWith({ messages: [msg('u1', 'user', 'Vacant?'), msg('a1', 'assistant', 'Vac')], status: 'streaming' })
    expect(document.activeElement).toBe(input)
    await userEvent.keyboard('x{Enter}')
    expect(input).toHaveValue('')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('a 429 shows the rate-limit text, as an alert, and no Retry', () => {
    const { panel } = renderPanel({ messages: [Q], status: 'error', error: 'rate-limit' })
    expect(within(panel).getByTestId('chat-error')).toHaveTextContent('Too many questions. Wait a minute.')
    expect(within(panel).getByTestId('chat-error')).toHaveAttribute('role', 'alert')
    expect(within(panel).queryByTestId('chat-retry')).toBeNull()
  })

  it('a generic error shows its text with Retry, and keeps the history', async () => {
    const { panel, retry } = renderPanel({ messages: [Q, A, msg('u2', 'user', 'And next year?')], status: 'error', error: 'failed' })
    expect(within(panel).getByTestId('chat-error')).toHaveTextContent('The AI did not answer. Try again.')
    expect(within(panel).getByTestId('chat-error')).toHaveAttribute('role', 'alert')
    expect(within(panel).getAllByTestId('chat-message')).toHaveLength(3)
    expect(within(panel).getByTestId('chat-input')).toBeEnabled()
    await userEvent.click(within(panel).getByTestId('chat-retry'))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('a stopped partial answer is kept and marked', () => {
    const { panel } = renderPanel({ messages: [Q, msg('a1', 'assistant', 'Vacant is 38,', { stopped: true })] })
    const row = within(panel).getAllByTestId('chat-message').at(1)
    expect(row).toHaveTextContent('Vacant is 38,')
    expect(row?.querySelector('[data-testid="chat-stopped"]')).toHaveTextContent('Stopped')
    expect(within(panel).getByTestId('chat-stopped')).toHaveTextContent('Stopped')
    expect(within(panel).getAllByTestId('chat-stopped')).toHaveLength(1)
  })

  it('the turn limit disables the input with "Start a new chat"', () => {
    const { panel } = renderPanel({ messages: [Q, A], turnsLeft: 0 })
    expect(within(panel).getByTestId('chat-input')).toBeDisabled()
    expect(within(panel).getByTestId('chat-limit')).toHaveTextContent('Start a new chat')
  })

  it('New chat calls onReset', async () => {
    const { panel, reset } = renderPanel({ messages: [Q, A] })
    await userEvent.click(within(panel).getByTestId('chat-new'))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('every button has an accessible name', () => {
    const { panel } = renderPanel({ messages: [Q, A] })
    for (const button of within(panel).getAllByRole('button')) expect(button).toHaveAccessibleName()
  })

  it('renders model text as text: no HTML is created', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const { panel } = renderPanel({ messages: [Q, msg('a1', 'assistant', evil)] })
    expect(within(panel).getAllByTestId('chat-message')[1]).toHaveTextContent(evil)
    expect(panel.querySelector('img')).toBeNull()
  })

  it('marks each message with its role', () => {
    const { panel } = renderPanel({ messages: [Q, A] })
    expect(within(panel).getAllByTestId('chat-message').map((m) => m.getAttribute('data-role'))).toEqual(['user', 'assistant'])
  })

  it('announces a finished answer once, when streaming ends, and not during streaming', () => {
    const { panel, rerenderWith } = renderPanel({ messages: [Q], status: 'submitted' })
    const announce = within(panel).getByTestId('chat-announce')
    expect(announce).toHaveAttribute('role', 'status')
    rerenderWith({ messages: [Q, msg('a1', 'assistant', 'Vacant is')], status: 'streaming' })
    expect(announce).toHaveTextContent('')
    rerenderWith({ messages: [Q, msg('a1', 'assistant', 'Vacant is 38,150 SF.')], status: 'streaming' })
    expect(announce).toHaveTextContent('')
    rerenderWith({ messages: [Q, msg('a1', 'assistant', 'Vacant is 38,150 SF.')], status: 'ready' })
    expect(announce).toHaveTextContent('Vacant is 38,150 SF.')
    rerenderWith({ messages: [Q, msg('a1', 'assistant', 'Vacant is 38,150 SF.')], status: 'ready' })
    expect(announce).toHaveTextContent('Vacant is 38,150 SF.')
  })

  it('announces an answer that arrives whole, when the status goes from submitted straight to ready', () => {
    const { panel, rerenderWith } = renderPanel({ messages: [Q], status: 'submitted' })
    rerenderWith({ messages: [Q, msg('a1', 'assistant', 'Vacant is 38,150 SF.')], status: 'ready' })
    expect(within(panel).getByTestId('chat-announce')).toHaveTextContent('Vacant is 38,150 SF.')
  })

  it('does not announce a stopped answer', () => {
    const { panel, rerenderWith } = renderPanel({ messages: [Q], status: 'streaming' })
    rerenderWith({ messages: [Q, msg('a1', 'assistant', 'Vacant is 38,', { stopped: true })], status: 'ready' })
    expect(within(panel).getByTestId('chat-announce')).toHaveTextContent('')
  })

  it('New chat clears the announcement, and the next turn does not bring it back', () => {
    const { panel, rerenderWith } = renderPanel({ messages: [Q], status: 'submitted' })
    const announce = within(panel).getByTestId('chat-announce')
    rerenderWith({ messages: [Q, A], status: 'ready' })
    expect(announce).toHaveTextContent(A.text)
    rerenderWith({ messages: [], status: 'ready' })
    expect(within(panel).queryByTestId('chat-announce')).toBeNull()
    rerenderWith({ messages: [Q], status: 'submitted' })
    expect(within(panel).getByTestId('chat-announce')).toHaveTextContent('')
  })

  it('has no status region until a conversation starts; the first keystroke adds it, empty', async () => {
    const { panel } = renderPanel()
    expect(within(panel).queryByRole('status')).toBeNull()
    await userEvent.type(within(panel).getByTestId('chat-input'), 'a')
    expect(within(panel).getByRole('status')).toHaveTextContent('')
  })

  it('does not take focus when it mounts (it lives in the drawer), but focus is in the input when an answer ends', () => {
    const { panel, rerenderWith } = renderPanel()
    const input = within(panel).getByTestId('chat-input')
    expect(document.activeElement).not.toBe(input)
    rerenderWith({ messages: [Q], status: 'submitted' })
    expect(input).toHaveAttribute('readonly')
    rerenderWith({ messages: [Q, A], status: 'streaming' })
    rerenderWith({ messages: [Q, A], status: 'ready' })
    expect(document.activeElement).toBe(input)
  })

  it('focus returns to the input when a turn ends after Stop took it', async () => {
    const { panel, rerenderWith } = renderPanel({ messages: [Q], status: 'streaming' })
    await userEvent.click(within(panel).getByTestId('chat-stop'))
    rerenderWith({ messages: [Q, msg('a1', 'assistant', 'Vac', { stopped: true })], status: 'ready' })
    expect(document.activeElement).toBe(within(panel).getByTestId('chat-input'))
  })

  it('focus is not pulled back when the broker moved on to something outside the assistant', () => {
    const outside = document.createElement('button')
    document.body.append(outside)
    try {
      const { panel, rerenderWith } = renderPanel({ messages: [Q], status: 'streaming' })
      outside.focus()
      rerenderWith({ messages: [Q, A], status: 'ready' })
      expect(document.activeElement).toBe(outside)
      expect(within(panel).getByTestId('chat-input')).not.toBe(document.activeElement)
    } finally {
      outside.remove()
    }
  })

  it('focus returns to the input when a request fails', () => {
    const { panel, rerenderWith } = renderPanel({ messages: [Q], status: 'submitted' })
    rerenderWith({ messages: [Q], status: 'error', error: 'failed' })
    expect(document.activeElement).toBe(within(panel).getByTestId('chat-input'))
  })
})
