import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CHAT_MAX_TURNS } from '../../shared/chat.schema'
import { ChatPanel } from './ChatPanel'
import type { ChatErrorKind, ChatStatus, PanelMessage } from './useBuildingChat'

type Overrides = Partial<{
  messages: PanelMessage[]
  status: ChatStatus
  error: ChatErrorKind
  turnsLeft: number
}>

function handlers() {
  return { onSend: vi.fn(), onStop: vi.fn(), onRetry: vi.fn(), onReset: vi.fn(), onClose: vi.fn() }
}

function props(over: Overrides = {}, h = handlers()) {
  return { id: 'chat-panel', messages: [], status: 'ready' as ChatStatus, error: null, turnsLeft: CHAT_MAX_TURNS, ...over, ...h }
}

function renderPanel(over: Overrides = {}) {
  const h = handlers()
  const view = render(<ChatPanel {...props(over, h)} />)
  const panel = screen.getByTestId('chat-panel')
  return { ...h, ...view, panel, rerenderWith: (next: Overrides) => view.rerender(<ChatPanel {...props(next, h)} />) }
}

const msg = (id: string, role: PanelMessage['role'], text: string, extra: Partial<PanelMessage> = {}): PanelMessage =>
  ({ id, role, text, pending: false, stopped: false, ...extra })

const Q = msg('u1', 'user', 'What is vacant today?')
const A = msg('a1', 'assistant', 'Vacant is 38,150 SF on 15 Nov 2026.')

describe('ChatPanel', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is a non-modal dialog named Building chat, hidden from print, with a log', () => {
    const { panel } = renderPanel()
    expect(panel).toHaveAttribute('role', 'dialog')
    expect(panel).not.toHaveAttribute('aria-modal', 'true')
    expect(panel).toHaveAccessibleName('Building chat')
    expect(panel).toHaveAttribute('data-print', 'hide')
    const log = within(panel).getByTestId('chat-log')
    expect(log).toHaveAttribute('role', 'log')
    expect(log).toHaveAttribute('aria-live', 'off')
  })

  it('the empty state shows three examples; clicking one sends its text', async () => {
    const { panel, onSend } = renderPanel()
    const examples = within(panel).getAllByTestId('chat-example')
    expect(examples.map((e) => e.textContent)).toEqual([
      'What is vacant on this date?', 'Which leases expire in the next 12 months?', 'Where could a 10,000 SF tenant go?',
    ])
    await userEvent.click(within(panel).getByRole('button', { name: 'What is vacant on this date?' }))
    expect(onSend).toHaveBeenCalledWith('What is vacant on this date?')
  })

  it('hides the examples once the conversation has started', () => {
    const { panel } = renderPanel({ messages: [Q, A] })
    expect(within(panel).queryByTestId('chat-example')).toBeNull()
  })

  it('Enter sends and clears the input; Shift+Enter is a new line', async () => {
    const { panel, onSend } = renderPanel()
    const input = within(panel).getByTestId('chat-input')
    await userEvent.type(input, 'Line one{Shift>}{Enter}{/Shift}line two')
    expect(onSend).not.toHaveBeenCalled()
    expect(input).toHaveValue('Line one\nline two')
    await userEvent.type(input, '{Enter}')
    expect(onSend).toHaveBeenCalledWith('Line one\nline two')
    expect(input).toHaveValue('')
  })

  it('the Send button sends the trimmed text', async () => {
    const { panel, onSend } = renderPanel()
    await userEvent.type(within(panel).getByTestId('chat-input'), '  Vacant?  ')
    await userEvent.click(within(panel).getByTestId('chat-send'))
    expect(onSend).toHaveBeenCalledWith('Vacant?')
  })

  it('does not send an empty or whitespace-only input', async () => {
    const { panel, onSend } = renderPanel()
    const input = within(panel).getByTestId('chat-input')
    await userEvent.type(input, '{Enter}')
    await userEvent.type(input, '   {Enter}')
    expect(onSend).not.toHaveBeenCalled()
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
    const { panel, onStop } = renderPanel({ messages: [Q], status: 'submitted' })
    expect(within(panel).queryByTestId('chat-send')).toBeNull()
    const input = within(panel).getByTestId('chat-input')
    expect(input).toHaveAttribute('readonly')
    expect(input).toHaveAttribute('aria-busy', 'true')
    expect(input).toBeEnabled()
    expect(within(panel).getByTestId('chat-pending')).toHaveTextContent('Looking at the building…')
    await userEvent.click(within(panel).getByTestId('chat-stop'))
    expect(onStop).toHaveBeenCalledTimes(1)
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
    const { panel, onSend, rerenderWith } = renderPanel()
    const input = within(panel).getByTestId('chat-input')
    await userEvent.type(input, 'Vacant?{Enter}')
    expect(onSend).toHaveBeenCalledTimes(1)
    rerenderWith({ messages: [msg('u1', 'user', 'Vacant?')], status: 'submitted' })
    expect(document.activeElement).toBe(input)
    await userEvent.keyboard('more{Enter}')
    rerenderWith({ messages: [msg('u1', 'user', 'Vacant?'), msg('a1', 'assistant', 'Vac')], status: 'streaming' })
    expect(document.activeElement).toBe(input)
    await userEvent.keyboard('x{Enter}')
    expect(input).toHaveValue('')
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('a 429 shows the rate-limit text, as an alert, and no Retry', () => {
    const { panel } = renderPanel({ messages: [Q], status: 'error', error: 'rate-limit' })
    expect(within(panel).getByTestId('chat-error')).toHaveTextContent('Too many questions. Wait a minute.')
    expect(within(panel).getByTestId('chat-error')).toHaveAttribute('role', 'alert')
    expect(within(panel).queryByTestId('chat-retry')).toBeNull()
  })

  it('a generic error shows its text with Retry, and keeps the history', async () => {
    const { panel, onRetry } = renderPanel({ messages: [Q, A, msg('u2', 'user', 'And next year?')], status: 'error', error: 'failed' })
    expect(within(panel).getByTestId('chat-error')).toHaveTextContent('The AI did not answer. Try again.')
    expect(within(panel).getByTestId('chat-error')).toHaveAttribute('role', 'alert')
    expect(within(panel).getAllByTestId('chat-message')).toHaveLength(3)
    expect(within(panel).getByTestId('chat-input')).toBeEnabled()
    await userEvent.click(within(panel).getByTestId('chat-retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
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
    const { panel, onReset } = renderPanel({ messages: [Q, A] })
    await userEvent.click(within(panel).getByTestId('chat-new'))
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('every button has an accessible name; Close calls onClose', async () => {
    const { panel, onClose } = renderPanel({ messages: [Q, A] })
    for (const button of within(panel).getAllByRole('button')) expect(button).toHaveAccessibleName()
    await userEvent.click(within(panel).getByTestId('chat-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
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
    expect(announce).toHaveTextContent('')
    rerenderWith({ messages: [Q], status: 'submitted' })
    expect(announce).toHaveTextContent('')
  })

  it('opening focuses the input, and focus is in it when an answer ends', () => {
    const { panel, rerenderWith } = renderPanel()
    const input = within(panel).getByTestId('chat-input')
    expect(document.activeElement).toBe(input)
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

  it('focus returns to the input when a request fails', () => {
    const { panel, rerenderWith } = renderPanel({ messages: [Q], status: 'submitted' })
    rerenderWith({ messages: [Q], status: 'error', error: 'failed' })
    expect(document.activeElement).toBe(within(panel).getByTestId('chat-input'))
  })

  it('Escape calls onClose and is not left unhandled for window listeners', () => {
    const seen = vi.fn()
    const onWindowKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) seen() }
    window.addEventListener('keydown', onWindowKey)
    try {
      const { panel, onClose } = renderPanel()
      fireEvent.keyDown(within(panel).getByTestId('chat-input'), { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(seen).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', onWindowKey)
    }
  })
})
