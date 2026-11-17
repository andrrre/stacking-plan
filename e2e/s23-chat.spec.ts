import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page, type Route } from '@playwright/test'
import { gotoApp, suite, TODAY } from './helpers'

// The assistant in the left drawer, with /api/chat mocked: no key is ever needed. The answer bodies are the real
// wire format, written by the server's snapshot tests from the real handler.

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
const ANSWER_SSE = readFileSync(path.join(FIXTURES, 'chat-answer.sse'), 'utf8')
const REQUIREMENT_SSE = readFileSync(path.join(FIXTURES, 'chat-requirement.sse'), 'utf8')
const ANSWER = 'On 15 Nov 2026, Ocean Drive Tower has 38,150 SF vacant and is 71.7% occupied.'
const REQUIREMENT_ANSWER = 'On 15 Nov 2026, suite 500 fits with 10,250 SF.'
const IMPORT_FIXTURE = path.join(FIXTURES, 'csv-valid.csv')
const FIRST_EXAMPLE = 'What is vacant on this date?'
const REQUIREMENT = 'Where could a 10,000 SF tenant go?'
const STREAM_HEADERS = { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' }
const sse = (chunks: string[]) => [...chunks, '[DONE]'].map((d) => `data: ${d}\n\n`).join('')
const IN_STREAM_ERROR = sse(['{"type":"start"}', '{"type":"error","errorText":"AI request failed"}'])
const MALFORMED_REQUIREMENT = sse([
  '{"type":"start"}',
  '{"type":"data-requirement","data":{"minSf":"all of it","clearShortlist":true}}',
  '{"type":"text-start","id":"t1"}',
  '{"type":"text-delta","id":"t1","delta":"Here is an answer."}',
  '{"type":"text-end","id":"t1"}',
  '{"type":"finish","finishReason":"stop"}',
])

type ChatBody = {
  buildingId: string
  today: string
  asOf: string
  changes: unknown[]
  messages: { role: string; text: string }[]
}

type PostReply = (route: Route, n: number) => Promise<void>

const stream = (body: string): PostReply => (route) => route.fulfill({ status: 200, headers: STREAM_HEADERS, body })
const answer = stream(ANSWER_SSE)

/** Mocks GET (available) and POST /api/chat; returns the parsed POST bodies, in order. Install before navigation. */
async function mockChat(page: Page, reply: PostReply = answer): Promise<ChatBody[]> {
  const bodies: ChatBody[] = []
  await page.route('**/api/chat', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true } })
    bodies.push(JSON.parse(route.request().postData() ?? 'null') as ChatBody)
    return reply(route, bodies.length)
  })
  return bodies
}

/** Opens the app in the 2D stack and waits for the assistant's AI mode (the availability probe answered). */
async function openAi(page: Page) {
  await gotoApp(page, 'stack')
  await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-mode', 'ai')
}

async function ask(page: Page, text: string) {
  await page.getByTestId('chat-input').fill(text)
  await page.getByTestId('chat-input').press('Enter')
}

const assistant = (page: Page) => page.locator('[data-testid="chat-message"][data-role="assistant"]')
const user = (page: Page) => page.locator('[data-testid="chat-message"][data-role="user"]')
const lastAnswerText = (page: Page) => assistant(page).last().getByTestId('chat-text')

test.describe('assistant, unmocked', () => {
  test('preview has no key: GET /api/chat says unavailable, there is no header Chat button, and the assistant reads locally', async ({ page }) => {
    const res = await page.request.get('/api/chat')
    expect(await res.json()).toEqual({ available: false })
    const posts: string[] = []
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/chat' && r.method() === 'POST') posts.push(r.url()) })
    const probe = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/chat')
    await gotoApp(page, 'stack')
    await probe
    await expect(page.getByTestId('suite-odt-500')).toBeVisible()
    await expect(page.getByTestId('chat-toggle')).toHaveCount(0)
    await expect(page.getByTestId('app-header').getByRole('button', { name: /chat/i })).toHaveCount(0)

    const panel = page.getByTestId('left-rail').getByTestId('chat-panel')
    await expect(panel).toHaveAttribute('data-mode', 'local')
    await expect(page.getByTestId('chat-intro')).toContainText('AI is unavailable')
    await expect(page.getByTestId('chat-example')).toHaveText([REQUIREMENT])
    await page.getByTestId('chat-example').click()
    await expect(page.getByTestId('req-min-sf')).toHaveValue('10,000')
    await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
    await expect(lastAnswerText(page)).toHaveText('AI is unavailable. The requirement was read locally.')
    await expect(page.getByTestId('ask-status')).toHaveText('Offline parsing · check the fields below')
    expect(posts).toEqual([])
  })
})

test.describe('assistant, mocked', () => {
  test('an example question streams the answer, with no page or console error; the form is untouched', async ({ page }) => {
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`) })
    const bodies = await mockChat(page)
    await openAi(page)
    await expect(page.getByTestId('chat-toggle')).toHaveCount(0)

    await expect(page.getByTestId('chat-example')).toHaveText([
      FIRST_EXAMPLE, 'Which leases expire in the next 12 months?', REQUIREMENT,
    ])
    await page.getByTestId('chat-example').first().click()
    await expect(user(page)).toHaveText(FIRST_EXAMPLE)
    await expect(lastAnswerText(page)).toHaveText(ANSWER)
    await expect(page.getByTestId('chat-announce')).toHaveText(ANSWER)
    await expect(page.getByTestId('chat-input')).toBeFocused()
    await expect(page.getByTestId('chat-example')).toHaveCount(0)
    await expect(page.getByTestId('chat-fill')).toHaveCount(0)
    await expect(page.getByTestId('req-min-sf')).toHaveValue('')
    await expect(page.getByTestId('match-list')).toHaveCount(0)

    expect(bodies).toEqual([{
      buildingId: 'odt', today: TODAY, asOf: TODAY, changes: [],
      messages: [{ role: 'user', text: FIRST_EXAMPLE }],
    }])
    expect(problems).toEqual([])
  })

  test('a requirement: the search form is filled, the matches light up on the building, and the answer is in words', async ({ page }) => {
    await mockChat(page, stream(REQUIREMENT_SSE))
    await openAi(page)
    await ask(page, REQUIREMENT)

    await expect(lastAnswerText(page)).toHaveText(REQUIREMENT_ANSWER)
    await expect(page.getByTestId('req-min-sf')).toHaveValue('10,000')
    await expect(page.getByTestId('req-max-sf')).toHaveValue('')
    await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
    await expect(page.getByTestId('match-2')).toHaveAttribute('data-key', 'odt-700+odt-710')
    await expect(suite(page, 500)).toHaveAttribute('data-match-rank', '1')
    await expect(suite(page, 710)).toHaveAttribute('data-match-rank', '2')
    const fill = assistant(page).last().getByTestId('chat-fill')
    await expect(fill.getByTestId('ask-understood')).toHaveText('at least 10,000 SF')
    await expect(fill.getByTestId('ask-status')).toHaveText('Read by AI · check the fields below')
  })

  test('an open question after a search answers in words only: the form and the matches stay as they were', async ({ page }) => {
    await mockChat(page)
    await openAi(page)
    await page.getByTestId('req-min-sf').fill('10,000')
    await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
    await ask(page, 'Which leases expire in the next 12 months?')
    await expect(lastAnswerText(page)).toHaveText(ANSWER)
    await expect(page.getByTestId('req-min-sf')).toHaveValue('10,000')
    await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
    await expect(page.getByTestId('chat-fill')).toHaveCount(0)
  })

  test('a malformed apply-requirement part in the stream is ignored; the answer still shows', async ({ page }) => {
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
    await mockChat(page, stream(MALFORMED_REQUIREMENT))
    await openAi(page)
    await page.getByTestId('req-min-sf').fill('12,000')
    await ask(page, 'Find me space')
    await expect(lastAnswerText(page)).toHaveText('Here is an answer.')
    await expect(page.getByTestId('req-min-sf')).toHaveValue('12,000')
    await expect(page.getByTestId('chat-fill')).toHaveCount(0)
    await expect(page.getByTestId('chat-error')).toHaveCount(0)
    expect(problems).toEqual([])
  })

  test('after the date slider moves, the next question carries the new asOf and the first exchange', async ({ page }) => {
    const bodies = await mockChat(page)
    await openAi(page)
    await ask(page, FIRST_EXAMPLE)
    await expect(lastAnswerText(page)).toHaveText(ANSWER)

    await page.getByTestId('date-slider').fill('8')
    await expect(page.getByTestId('date-label')).toContainText('Jul 2027')
    await ask(page, 'And in July?')
    await expect(assistant(page)).toHaveCount(2)
    await expect.poll(() => bodies.length).toBe(2)

    const second = bodies[1] as ChatBody
    expect(second.buildingId).toBe('odt')
    expect(second.today).toBe(TODAY)
    expect(second.asOf).toMatch(/^2027-07-\d\d$/)
    expect(second.messages).toEqual([
      { role: 'user', text: FIRST_EXAMPLE },
      { role: 'assistant', text: ANSWER },
      { role: 'user', text: 'And in July?' },
    ])
  })

  test('a 429 shows the rate-limit text', async ({ page }) => {
    await mockChat(page, (route) => route.fulfill({ status: 429, json: { error: 'Too many requests' } }))
    await openAi(page)
    await ask(page, FIRST_EXAMPLE)
    const error = page.getByTestId('chat-error')
    await expect(error).toHaveAttribute('data-kind', 'rate-limit')
    await expect(error).toHaveText('Too many questions. Wait a minute.')
    await expect(page.getByTestId('chat-retry')).toHaveCount(0)
    await expect(page.getByTestId('chat-fallback')).toHaveCount(0)
  })

  test('a 502 shows the generic text, and Retry sends again and shows the answer', async ({ page }) => {
    const bodies = await mockChat(page, (route, n) => n === 1
      ? route.fulfill({ status: 502, json: { error: 'AI request failed' } })
      : answer(route, n))
    await openAi(page)
    await ask(page, FIRST_EXAMPLE)
    const error = page.getByTestId('chat-error')
    await expect(error).toHaveAttribute('data-kind', 'failed')
    await expect(error).toContainText('The AI did not answer. Try again.')

    await page.getByTestId('chat-retry').click()
    await expect(lastAnswerText(page)).toHaveText(ANSWER)
    await expect(error).toHaveCount(0)
    expect(bodies).toHaveLength(2)
    expect(bodies[1]?.messages).toEqual([{ role: 'user', text: FIRST_EXAMPLE }])
  })

  test('when the AI call fails on a requirement, the local parser fills the form and says so', async ({ page }) => {
    await mockChat(page, (route) => route.fulfill({ status: 502, json: { error: 'AI request failed' } }))
    await openAi(page)
    await ask(page, 'Law firm, roughly 9–11k SF, moving in by Q2 next year, under $60')
    await expect(page.getByTestId('chat-error')).toHaveAttribute('data-kind', 'failed')
    const fallback = page.getByTestId('chat-fallback')
    await expect(fallback).toContainText('AI is unavailable, so the requirement was read locally.')
    await expect(fallback.getByTestId('ask-status')).toHaveText('Offline parsing · check the fields below')
    await expect(page.getByTestId('req-min-sf')).toHaveValue('9,000')
    await expect(page.getByTestId('req-max-sf')).toHaveValue('11,000')
    await expect(page.getByTestId('req-max-rent')).toHaveValue('60')
    await expect(page.getByTestId('date-label')).toContainText('Jun 2027')
    await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-400+odt-410')
  })

  test('an error inside a 200 stream shows the generic text', async ({ page }) => {
    await mockChat(page, stream(IN_STREAM_ERROR))
    await openAi(page)
    await ask(page, FIRST_EXAMPLE)
    await expect(page.getByTestId('chat-error')).toHaveAttribute('data-kind', 'failed')
    await expect(page.getByTestId('chat-retry')).toBeVisible()
    await expect(user(page)).toHaveText(FIRST_EXAMPLE)
    await expect(assistant(page)).toHaveCount(0)
  })

  test('New chat empties the conversation and brings the examples back', async ({ page }) => {
    await mockChat(page)
    await openAi(page)
    await ask(page, FIRST_EXAMPLE)
    await expect(lastAnswerText(page)).toHaveText(ANSWER)
    await page.getByTestId('chat-new').click()
    await expect(page.getByTestId('chat-message')).toHaveCount(0)
    await expect(page.getByTestId('chat-example')).toHaveCount(3)
  })

  test('an imported building reads locally and sends nothing', async ({ page }) => {
    const bodies = await mockChat(page)
    await openAi(page)
    await page.getByTestId('import-csv-input').setInputFiles(IMPORT_FIXTURE)
    await expect(page.getByTestId('building-switcher')).toHaveValue('csv-bayfront-commons')

    await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-mode', 'local')
    await expect(page.getByTestId('chat-intro')).toContainText('AI is off for imported buildings: their data stays in this browser.')
    await ask(page, '2,000 SF under $60')
    await expect(page.getByTestId('req-min-sf')).toHaveValue('2,000')
    await expect(page.getByTestId('req-max-rent')).toHaveValue('60')
    await expect(lastAnswerText(page)).toHaveText(
      'AI is off for imported buildings: their data stays in this browser. The requirement was read locally.',
    )
    expect(bodies).toEqual([])
  })

  test('a tour shuts the drawer and the assistant with it; the conversation is still there afterwards', async ({ page }) => {
    await mockChat(page)
    await openAi(page)
    await ask(page, FIRST_EXAMPLE)
    await expect(lastAnswerText(page)).toHaveText(ANSWER)

    const tour = page.getByTestId('tour')
    await tour.click()
    await expect(tour).toHaveText('End tour')
    await expect(page.getByTestId('left-rail')).toHaveAttribute('inert', '')
    await expect(page.getByTestId('chat-panel')).toBeHidden()

    await tour.click()
    await expect(tour).toHaveText('Tour')
    await expect(page.getByTestId('chat-panel')).toBeVisible()
    await expect(user(page)).toHaveText(FIRST_EXAMPLE)
    await expect(lastAnswerText(page)).toHaveText(ANSWER)
  })
})

test.describe('assistant layout at 1440×900', () => {
  const fieldInView = async (page: Page) => {
    const box = await page.getByTestId('req-min-sf').boundingBox()
    if (!box) throw new Error('no min-size field box')
    return box.y >= 0 && box.y + box.height <= 900
  }
  const railScroll = (page: Page) => page.getByTestId('left-rail').evaluate((el) => el.scrollTop)

  test('the search form is in view below the assistant, empty and after a long conversation, and still works', async ({ page }) => {
    await mockChat(page)
    await openAi(page)
    expect(page.viewportSize()).toEqual({ width: 1440, height: 900 })
    expect(await fieldInView(page)).toBe(true)
    expect(await railScroll(page)).toBe(0)

    for (let i = 1; i <= 5; i += 1) {
      await ask(page, `Question ${i}?`)
      await expect(assistant(page)).toHaveCount(i)
    }
    const log = page.getByTestId('chat-log')
    const sizes = await log.evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight, top: el.scrollTop }))
    expect(sizes.client).toBeLessThanOrEqual(300)
    expect(sizes.scroll).toBeGreaterThan(sizes.client)
    expect(sizes.top + sizes.client).toBeGreaterThanOrEqual(sizes.scroll - 2) // the newest message is in view
    expect(await railScroll(page)).toBe(0)
    expect(await fieldInView(page)).toBe(true)

    await page.getByTestId('req-min-sf').fill('10,000')
    await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
  })
})
