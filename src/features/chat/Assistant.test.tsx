import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import type { AppState } from '../../app/state/types'
import { building } from '../../domain/testing/fixtures'
import { RequirementForm } from '../finder/RequirementForm'
import { Assistant } from './Assistant'
import { SETUP_HINT } from './assistantCopy'

const TODAY = '2026-11-15'

/** A requirement data part, then the answer text: what the server sends after a find_space call. */
function answerWith(data: unknown, text: string): Response {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'data-requirement', data })
        writer.write({ type: 'text-start', id: 't1' })
        writer.write({ type: 'text-delta', id: 't1', delta: text })
        writer.write({ type: 'text-end', id: 't1' })
      },
    }),
  })
}

/** GET /api/chat answers { available }; POST answers with `post`. */
function stubChat(available: boolean, post: () => Response = () => answerWith({ minSf: 9000 }, 'Suite 500 fits.')) {
  const fetchFn = vi.fn<typeof fetch>(async (_input, init) => ((init?.method ?? 'GET') === 'GET' ? Response.json({ available }) : post()))
  vi.stubGlobal('fetch', fetchFn)
  return fetchFn
}

const posts = (fetchFn: ReturnType<typeof stubChat>) => fetchFn.mock.calls.filter(([, init]) => init?.method === 'POST')

function renderAssistant(overrides: Partial<AppState> = {}, dev = false) {
  return render(
    <StateProvider initialState={{ ...initState('', null, TODAY), ...overrides }}>
      <Assistant dev={dev} />
      <RequirementForm />
    </StateProvider>,
  )
}

async function ask(text: string) {
  await userEvent.type(screen.getByTestId('chat-input'), `${text}{Enter}`)
}

const mode = () => screen.getByTestId('chat-panel').getAttribute('data-mode')

afterEach(() => vi.unstubAllGlobals())

describe('Assistant', () => {
  it('with a chat model: the AI mode, three examples, and a requirement from the stream fills the form', async () => {
    const fetchFn = stubChat(true)
    renderAssistant()
    await waitFor(() => expect(mode()).toBe('ai'))
    expect(screen.getAllByTestId('chat-example')).toHaveLength(3)
    await ask('Law firm, about 9k SF')
    await waitFor(() => expect(screen.getByTestId('req-min-sf')).toHaveValue('9,000'))
    const answer = screen.getAllByTestId('chat-message').at(-1) as HTMLElement
    expect(within(answer).getByTestId('chat-text')).toHaveTextContent('Suite 500 fits.')
    expect(within(answer).getByTestId('ask-status')).toHaveTextContent('Read by AI')
    expect(posts(fetchFn)).toHaveLength(1)
  })

  it('a malformed requirement from the stream is ignored: the form stays as it was, the answer still shows', async () => {
    stubChat(true, () => answerWith({ minSf: 'all of it', clear: true }, 'Here is an answer.'))
    renderAssistant()
    await waitFor(() => expect(mode()).toBe('ai'))
    await userEvent.type(screen.getByTestId('req-min-sf'), '12,000')
    await ask('Anything')
    await waitFor(() => expect(screen.getAllByTestId('chat-text').at(-1)).toHaveTextContent('Here is an answer.'))
    expect(screen.getByTestId('req-min-sf')).toHaveValue('12,000')
    expect(screen.queryByTestId('chat-fill')).toBeNull()
  })

  it('without a chat model: local mode, only the requirement example, and a requirement still fills the form', async () => {
    const fetchFn = stubChat(false)
    renderAssistant()
    await waitFor(() => expect(fetchFn).toHaveBeenCalled())
    expect(mode()).toBe('local')
    expect(screen.getByTestId('chat-intro')).toHaveTextContent('AI is unavailable')
    expect(screen.getByTestId('chat-intro')).not.toHaveTextContent(SETUP_HINT)
    expect(screen.getAllByTestId('chat-example').map((e) => e.textContent)).toEqual(['Where could a 10,000 SF tenant go?'])
    await userEvent.click(screen.getByTestId('chat-example'))
    expect(screen.getByTestId('req-min-sf')).toHaveValue('10,000')
    expect(screen.getAllByTestId('chat-text').at(-1)).toHaveTextContent('AI is unavailable. The requirement was read locally.')
    expect(screen.getByTestId('ask-status')).toHaveTextContent('Offline parsing · check the fields below')
    expect(posts(fetchFn)).toEqual([])
  })

  it('in dev without a key the intro says how to turn the AI on', async () => {
    const fetchFn = stubChat(false)
    renderAssistant({}, true)
    await waitFor(() => expect(fetchFn).toHaveBeenCalled())
    expect(screen.getByTestId('chat-intro')).toHaveTextContent(SETUP_HINT)
  })

  it('an imported building reads locally and sends nothing, even with a chat model', async () => {
    const fetchFn = stubChat(true)
    const own = building({ id: 'csv-own' })
    renderAssistant({ importedBuildings: [own], buildingId: 'csv-own' })
    await waitFor(() => expect(fetchFn).toHaveBeenCalled())
    expect(mode()).toBe('local')
    expect(screen.getByTestId('chat-intro')).toHaveTextContent('AI is off for imported buildings')
    await ask('2,000 SF under $60')
    expect(screen.getByTestId('req-min-sf')).toHaveValue('2,000')
    expect(screen.getByTestId('req-max-rent')).toHaveValue('60')
    expect(posts(fetchFn)).toEqual([])
  })

  it('when the AI call fails, the requirement is read locally into the form, with the error and Retry', async () => {
    stubChat(true, () => Response.json({ error: 'AI request failed' }, { status: 502 }))
    renderAssistant()
    await waitFor(() => expect(mode()).toBe('ai'))
    await ask('at least 9k SF under $50')
    expect(await screen.findByTestId('chat-error')).toHaveTextContent('The AI did not answer. Try again.')
    expect(screen.getByTestId('chat-fallback')).toHaveTextContent('AI is unavailable, so the requirement was read locally.')
    expect(screen.getByTestId('req-min-sf')).toHaveValue('9,000')
    expect(screen.getByTestId('req-max-rent')).toHaveValue('50')
    expect(screen.getByTestId('chat-retry')).toBeVisible()
  })
})
