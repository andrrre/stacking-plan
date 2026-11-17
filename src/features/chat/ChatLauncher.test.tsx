import { describe, it, expect, vi, afterEach } from 'vitest'
import { useEffect } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import type { Action, AppState } from '../../app/state/types'
import { useAppState } from '../../app/state/useAppState'
import { building } from '../../domain/testing/fixtures'
import { ChatLauncher } from './ChatLauncher'

const ANSWER = 'Vacant is 38,150 SF on 15 Nov 2026.'

function answer(): Response {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'text-start', id: 't1' })
        writer.write({ type: 'text-delta', id: 't1', delta: ANSWER })
        writer.write({ type: 'text-end', id: 't1' })
      },
    }),
  })
}

/** GET /api/chat answers { available }; POST streams an answer. */
function stubChat(available: boolean) {
  const fetchFn = vi.fn<typeof fetch>(async (_input, init) =>
    (init?.method ?? 'GET') === 'GET' ? Response.json({ available }) : answer())
  vi.stubGlobal('fetch', fetchFn)
  return fetchFn
}

const posts = (fetchFn: ReturnType<typeof stubChat>) => fetchFn.mock.calls.filter(([, init]) => init?.method === 'POST')

let dispatchRef: ((a: Action) => void) | null = null
const capture = (d: (a: Action) => void) => {
  dispatchRef = d
}
/** Hands the app's dispatch to the test. */
function Dispatcher() {
  const { dispatch } = useAppState()
  useEffect(() => capture(dispatch), [dispatch])
  return null
}
const dispatch = (action: Action) => act(() => dispatchRef?.(action))

function renderLauncher(overrides: Partial<AppState> = {}, dev = false) {
  const state = { ...initState('', null, '2026-11-15'), ...overrides }
  return render(
    <StateProvider initialState={state}>
      <Dispatcher />
      <ChatLauncher className="btn" dev={dev} />
    </StateProvider>,
  )
}

async function settledProbe(fetchFn: ReturnType<typeof stubChat>) {
  await waitFor(() => expect(fetchFn).toHaveBeenCalled())
  await act(async () => {})
}

async function openAndAsk() {
  await userEvent.click(await screen.findByTestId('chat-toggle'))
  await userEvent.type(within(screen.getByTestId('chat-panel')).getByTestId('chat-input'), 'What is vacant today?{Enter}')
  await waitFor(() => expect(screen.getAllByTestId('chat-message').map((m) => m.textContent)).toContain(ANSWER))
}

describe('ChatLauncher', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is hidden when the chat is unavailable outside dev', async () => {
    const fetchFn = stubChat(false)
    renderLauncher()
    await settledProbe(fetchFn)
    expect(screen.queryByTestId('chat-toggle')).toBeNull()
    expect(fetchFn).toHaveBeenCalledWith('/api/chat', expect.anything())
  })

  it('in dev without a key it is a hint button with the setup text', async () => {
    stubChat(false)
    renderLauncher({}, true)
    const toggle = await screen.findByTestId('chat-toggle')
    expect(toggle).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('chat-toggle-hint')).toHaveTextContent('Add ANTHROPIC_API_KEY to .env and restart to turn the chat on.')
    await userEvent.click(toggle)
    expect(screen.queryByTestId('chat-panel')).toBeNull()
  })

  it('on an imported building it is a hint button and never posts to /api/chat', async () => {
    const fetchFn = stubChat(true)
    const imported = building({ id: 'imported-1', name: 'My Building' })
    renderLauncher({ importedBuildings: [imported], buildingId: imported.id })
    await settledProbe(fetchFn)
    const toggle = screen.getByTestId('chat-toggle')
    expect(toggle).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('chat-toggle-hint')).toHaveTextContent('Chat is off for imported buildings: their data stays in this browser.')
    await userEvent.click(toggle)
    expect(screen.queryByTestId('chat-panel')).toBeNull()
    expect(posts(fetchFn)).toHaveLength(0)
  })

  it('the toggle opens and closes the panel, with aria-expanded and aria-controls', async () => {
    stubChat(true)
    renderLauncher()
    const toggle = await screen.findByTestId('chat-toggle')
    expect(toggle).toHaveTextContent('Chat')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByTestId('chat-panel')
    expect(toggle).toHaveAttribute('aria-controls', panel.id)
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('chat-panel')).toBeNull()
  })

  it('opening focuses the input; closing returns focus to the toggle', async () => {
    stubChat(true)
    renderLauncher()
    const toggle = await screen.findByTestId('chat-toggle')
    await userEvent.click(toggle)
    expect(document.activeElement).toBe(screen.getByTestId('chat-input'))
    await userEvent.click(screen.getByTestId('chat-close'))
    expect(screen.queryByTestId('chat-panel')).toBeNull()
    expect(document.activeElement).toBe(toggle)
    await userEvent.click(toggle)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('chat-panel')).toBeNull()
    expect(document.activeElement).toBe(toggle)
  })

  it('shows nothing while a tour presents the building, and keeps the conversation for after', async () => {
    stubChat(true)
    renderLauncher()
    await openAndAsk()
    const stop = {
      key: 'odt-500', suiteIds: ['odt-500'], suiteNumbers: ['500'], floor: 5, totalSf: 10250, excessSf: 250,
      blendedRentPsf: 48, availableFrom: '2026-11-15', availability: 'now' as const, caveats: [],
    }
    dispatch({ type: 'tour/start', stops: [stop], index: 0, playing: false })
    expect(screen.queryByTestId('chat-toggle')).toBeNull()
    expect(screen.queryByTestId('chat-panel')).toBeNull()
    dispatch({ type: 'tour/exit' })
    expect(screen.getByTestId('chat-toggle')).toBeInTheDocument()
    expect(screen.getAllByTestId('chat-message').map((m) => m.textContent)).toEqual(['What is vacant today?', ANSWER])
  })

  it('shows nothing during a tour', async () => {
    stubChat(true)
    renderLauncher({ presenting: false, tour: { stops: [], index: 0, phase: 'fly', playing: false } })
    await act(async () => {})
    expect(screen.queryByTestId('chat-toggle')).toBeNull()
    expect(screen.queryByTestId('chat-panel')).toBeNull()
  })

  it('the imported-building hint button is not shown while presenting', async () => {
    const fetchFn = stubChat(true)
    const imported = building({ id: 'imported-1', name: 'My Building' })
    renderLauncher({ importedBuildings: [imported], buildingId: imported.id, presenting: true })
    await settledProbe(fetchFn)
    expect(screen.queryByTestId('chat-toggle')).toBeNull()
  })

  it('switching building empties the conversation', async () => {
    stubChat(true)
    renderLauncher()
    await openAndAsk()
    dispatch({ type: 'building/set', buildingId: 'pbp' })
    expect(screen.queryAllByTestId('chat-message')).toHaveLength(0)
    expect(screen.getAllByTestId('chat-example')).toHaveLength(3)
  })
})
