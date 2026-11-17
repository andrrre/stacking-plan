import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page, type Route } from '@playwright/test'
import { gotoApp, suite, TODAY } from './helpers'

// The building chat in the built app, with /api/chat mocked: no key is ever needed. The answer body is the real
// wire format, written by the server's snapshot test from the real handler.

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
const ANSWER_SSE = readFileSync(path.join(FIXTURES, 'chat-answer.sse'), 'utf8')
const ANSWER = 'On 15 Nov 2026, Ocean Drive Tower has 38,150 SF vacant and is 71.7% occupied.'
const IMPORT_FIXTURE = path.join(FIXTURES, 'csv-valid.csv')
const FIRST_EXAMPLE = 'What is vacant on this date?'
const STREAM_HEADERS = { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' }
const IN_STREAM_ERROR = ['{"type":"start"}', '{"type":"error","errorText":"AI request failed"}', '[DONE]']
  .map((d) => `data: ${d}\n\n`).join('')

type ChatBody = {
  buildingId: string
  today: string
  asOf: string
  changes: unknown[]
  messages: { role: string; text: string }[]
}

type PostReply = (route: Route, n: number) => Promise<void>

const answer: PostReply = (route) => route.fulfill({ status: 200, headers: STREAM_HEADERS, body: ANSWER_SSE })

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

async function openChat(page: Page) {
  await page.getByTestId('chat-toggle').click()
  await expect(page.getByTestId('chat-toggle')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('chat-panel')).toBeVisible()
  await expect(page.getByTestId('chat-input')).toBeFocused()
}

async function ask(page: Page, text: string) {
  await page.getByTestId('chat-input').fill(text)
  await page.getByTestId('chat-input').press('Enter')
}

const assistant = (page: Page) => page.locator('[data-testid="chat-message"][data-role="assistant"]')
const user = (page: Page) => page.locator('[data-testid="chat-message"][data-role="user"]')

test.describe('building chat, unmocked', () => {
  test('preview has no key: GET /api/chat says unavailable and the toggle is not in the page', async ({ page }) => {
    const res = await page.request.get('/api/chat')
    expect(await res.json()).toEqual({ available: false })
    const probe = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/chat')
    await gotoApp(page, 'stack')
    await probe
    await expect(page.getByTestId('suite-odt-500')).toBeVisible()
    await expect(page.getByTestId('chat-toggle')).toHaveCount(0)
  })
})

test.describe('building chat, mocked', () => {
  test('an example question streams the answer, with no page or console error', async ({ page }) => {
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`) })
    const bodies = await mockChat(page)
    await gotoApp(page, 'stack')
    await openChat(page)

    await expect(page.getByTestId('chat-example')).toHaveText([
      FIRST_EXAMPLE, 'Which leases expire in the next 12 months?', 'Where could a 10,000 SF tenant go?',
    ])
    await page.getByTestId('chat-example').first().click()
    await expect(user(page)).toHaveText(FIRST_EXAMPLE)
    await expect(assistant(page)).toHaveText(ANSWER)
    await expect(page.getByTestId('chat-announce')).toHaveText(ANSWER)
    await expect(page.getByTestId('chat-input')).toBeFocused()
    await expect(page.getByTestId('chat-example')).toHaveCount(0)

    expect(bodies).toEqual([{
      buildingId: 'odt', today: TODAY, asOf: TODAY, changes: [],
      messages: [{ role: 'user', text: FIRST_EXAMPLE }],
    }])

    await page.getByTestId('chat-close').click()
    await expect(page.getByTestId('chat-panel')).toHaveCount(0)
    await expect(page.getByTestId('chat-toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('chat-toggle')).toBeFocused()
    expect(problems).toEqual([])
  })

  test('after the date slider moves, the next question carries the new asOf and the first exchange', async ({ page }) => {
    const bodies = await mockChat(page)
    await gotoApp(page, 'stack')
    await openChat(page)
    await ask(page, FIRST_EXAMPLE)
    await expect(assistant(page)).toHaveText(ANSWER)

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
    await gotoApp(page, 'stack')
    await openChat(page)
    await ask(page, FIRST_EXAMPLE)
    const error = page.getByTestId('chat-error')
    await expect(error).toHaveAttribute('data-kind', 'rate-limit')
    await expect(error).toHaveText('Too many questions. Wait a minute.')
    await expect(page.getByTestId('chat-retry')).toHaveCount(0)
  })

  test('a 502 shows the generic text, and Retry sends again and shows the answer', async ({ page }) => {
    const bodies = await mockChat(page, (route, n) => n === 1
      ? route.fulfill({ status: 502, json: { error: 'AI request failed' } })
      : answer(route, n))
    await gotoApp(page, 'stack')
    await openChat(page)
    await ask(page, FIRST_EXAMPLE)
    const error = page.getByTestId('chat-error')
    await expect(error).toHaveAttribute('data-kind', 'failed')
    await expect(error).toContainText('The AI did not answer. Try again.')

    await page.getByTestId('chat-retry').click()
    await expect(assistant(page)).toHaveText(ANSWER)
    await expect(error).toHaveCount(0)
    expect(bodies).toHaveLength(2)
    expect(bodies[1]?.messages).toEqual([{ role: 'user', text: FIRST_EXAMPLE }])
  })

  test('an error inside a 200 stream shows the generic text', async ({ page }) => {
    await mockChat(page, (route) => route.fulfill({ status: 200, headers: STREAM_HEADERS, body: IN_STREAM_ERROR }))
    await gotoApp(page, 'stack')
    await openChat(page)
    await ask(page, FIRST_EXAMPLE)
    await expect(page.getByTestId('chat-error')).toHaveAttribute('data-kind', 'failed')
    await expect(page.getByTestId('chat-retry')).toBeVisible()
    await expect(user(page)).toHaveText(FIRST_EXAMPLE)
    await expect(assistant(page)).toHaveCount(0)
  })

  test('with no drawer open, the stage makes room: the panel covers none of the stack, legend or date slider', async ({ page }) => {
    await mockChat(page)
    await gotoApp(page, 'stack')
    await expect(page.getByTestId('right-panel')).toHaveAttribute('data-open', 'false')
    await openChat(page)
    const panel = await page.getByTestId('chat-panel').boundingBox()
    if (!panel) throw new Error('no panel box')
    for (const id of ['stack', 'legend', 'date-slider-panel']) {
      await expect.poll(async () => {
        const box = await page.getByTestId(id).boundingBox()
        return box ? box.x + box.width : Infinity
      }, { message: `${id} ends left of the chat panel` }).toBeLessThanOrEqual(panel.x)
    }
  })

  test('an imported building gets a hint button and sends nothing', async ({ page }) => {
    const bodies = await mockChat(page)
    await gotoApp(page, 'stack')
    await expect(page.getByTestId('chat-toggle')).toBeVisible()
    await page.getByTestId('import-csv-input').setInputFiles(IMPORT_FIXTURE)
    await expect(page.getByTestId('building-switcher')).toHaveValue('csv-bayfront-commons')

    const toggle = page.getByTestId('chat-toggle')
    await expect(toggle).toHaveAttribute('aria-disabled', 'true')
    await toggle.hover()
    await expect(page.getByTestId('chat-toggle-hint')).toHaveText('Chat is off for imported buildings: their data stays in this browser.')
    await expect(page.getByTestId('chat-panel')).toHaveCount(0)
    expect(bodies).toEqual([])
  })

  test('a tour (presentation mode) hides the toggle and the panel; the conversation is still there afterwards', async ({ page }) => {
    await mockChat(page)
    await gotoApp(page, 'stack')
    await openChat(page)
    await ask(page, FIRST_EXAMPLE)
    await expect(assistant(page)).toHaveText(ANSWER)

    const tour = page.getByTestId('tour')
    await tour.click()
    await expect(tour).toHaveText('End tour')
    await expect(page.getByTestId('chat-toggle')).toHaveCount(0)
    await expect(page.getByTestId('chat-panel')).toHaveCount(0)

    await tour.click()
    await expect(tour).toHaveText('Tour')
    await expect(page.getByTestId('chat-panel')).toBeVisible()
    await expect(user(page)).toHaveText(FIRST_EXAMPLE)
    await expect(assistant(page)).toHaveText(ANSWER)
  })

  test('Escape in the panel closes only the panel: the suite details drawer stays open', async ({ page }) => {
    await mockChat(page)
    await gotoApp(page, 'stack')
    await suite(page, 600).click()
    const right = page.getByTestId('right-panel')
    await expect(right).toHaveAttribute('data-open', 'true')
    await openChat(page)

    const panel = await page.getByTestId('chat-panel').boundingBox()
    const drawer = await right.boundingBox()
    if (!panel || !drawer) throw new Error('no box')
    expect(panel.x + panel.width, 'the panel ends left of the details drawer').toBeLessThanOrEqual(drawer.x)

    await page.getByTestId('chat-input').press('Escape')
    await expect(page.getByTestId('chat-panel')).toHaveCount(0)
    await expect(page.getByTestId('chat-toggle')).toBeFocused()
    await expect(right).toHaveAttribute('data-open', 'true')
    await expect(suite(page, 600)).toHaveAttribute('aria-pressed', 'true')
  })
})
