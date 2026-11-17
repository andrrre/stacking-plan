import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gotoApp } from './helpers'

// The assistant without the AI: the preview build has no key, so every message goes through the offline parser,
// which fills the search form and says the requirement was read locally.

const IMPORT_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'csv-valid.csv')

const LAW_FIRM = 'Law firm, roughly 9–11k SF, moving in by Q2 next year, under $60'
const READ_LOCALLY = 'AI is unavailable. The requirement was read locally.'

const lastAnswer = (page: Page) => page.locator('[data-testid="chat-message"][data-role="assistant"]').last()

async function ask(page: Page, text: string) {
  const answers = await page.locator('[data-testid="chat-message"][data-role="assistant"]').count()
  await page.getByTestId('chat-input').fill(text)
  await page.getByTestId('chat-input').press('Enter')
  await expect(page.locator('[data-testid="chat-message"][data-role="assistant"]')).toHaveCount(answers + 1)
}

test.describe('assistant offline (no key)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, 'stack')
    await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-mode', 'local')
  })

  test('the law-firm query fills the form, sets Jun 2027 and lists 400+410, 500, 700+710', async ({ page }) => {
    await ask(page, LAW_FIRM)

    await expect(lastAnswer(page).getByTestId('chat-text')).toHaveText(READ_LOCALLY)
    await expect(lastAnswer(page).getByTestId('ask-status')).toContainText('Offline parsing')
    await expect(page.getByTestId('req-min-sf')).toHaveValue('9,000')
    await expect(page.getByTestId('req-max-sf')).toHaveValue('11,000')
    await expect(page.getByTestId('req-max-rent')).toHaveValue('60')
    await expect(page.getByTestId('date-label')).toContainText('Jun 2027')

    const keys = ['odt-400+odt-410', 'odt-500', 'odt-700+odt-710']
    for (const [i, key] of keys.entries()) {
      await expect(page.getByTestId(`match-${i + 1}`)).toHaveAttribute('data-key', key)
    }
    await expect(page.getByTestId('match-4')).toHaveCount(0)
  })

  test('a query with no size says so, leaves the size empty and runs no search', async ({ page }) => {
    await ask(page, 'Law firm moving in by June')

    await expect(lastAnswer(page).getByTestId('ask-warning')).toContainText('Size not understood')
    await expect(page.getByTestId('req-min-sf')).toHaveValue('')
    await expect(page.getByTestId('date-label')).toContainText('Jun 2027')
    await expect(page.getByTestId('match-list')).toHaveCount(0)
  })

  test('an open question does not pretend: it says only a requirement can be read here and leaves the form', async ({ page }) => {
    await page.getByTestId('req-min-sf').fill('10,000')
    await ask(page, 'What is vacant on this date?')

    await expect(lastAnswer(page).getByTestId('chat-text')).toHaveText(
      'AI is unavailable. Only a space requirement can be read here (a size, a rent, a move-in date) and none was found, so the search form was left as it was.',
    )
    await expect(lastAnswer(page).getByTestId('chat-fill')).toHaveCount(0)
    await expect(page.getByTestId('req-min-sf')).toHaveValue('10,000')
    await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
  })

  test('a new query replaces the previous size and rent (C8)', async ({ page }) => {
    await page.getByTestId('req-min-sf').fill('10,000')
    await page.getByTestId('req-max-sf').fill('10,300')
    await page.getByTestId('req-max-rent').fill('50')
    await ask(page, 'at least 9k SF')

    await expect(page.getByTestId('req-min-sf')).toHaveValue('9,000')
    await expect(page.getByTestId('req-max-sf')).toHaveValue('')
    await expect(page.getByTestId('req-max-rent')).toHaveValue('')
    await expect(page.getByTestId('match-1')).toBeVisible()
  })

  test('an invalid size draft is replaced by the understood size', async ({ page }) => {
    await page.getByTestId('req-min-sf').fill('lots')
    await expect(page.getByTestId('req-min-sf')).toHaveAttribute('aria-invalid', 'true')
    await ask(page, '10k SF')

    await expect(page.getByTestId('req-min-sf')).toHaveValue('10,000')
    await expect(page.getByTestId('req-min-sf')).not.toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
  })

  test('invalid max and rent drafts are cleared when the query states neither', async ({ page }) => {
    await page.getByTestId('req-max-sf').fill('huge')
    await page.getByTestId('req-max-rent').fill('cheap')
    await expect(page.getByTestId('req-max-rent')).toHaveAttribute('aria-invalid', 'true')
    await ask(page, '10k SF')

    await expect(page.getByTestId('req-min-sf')).toHaveValue('10,000')
    await expect(page.getByTestId('req-max-sf')).toHaveValue('')
    await expect(page.getByTestId('req-max-rent')).toHaveValue('')
    await expect(page.getByTestId('req-max-sf')).not.toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('req-max-rent')).not.toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
  })
})

test.describe('assistant with an imported building', () => {
  test('parses offline and sends no request to /api/chat', async ({ page }) => {
    const chatPosts: string[] = []
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/chat' && r.method() === 'POST') chatPosts.push(r.url()) })
    await gotoApp(page, 'stack')
    await page.getByTestId('import-csv-input').setInputFiles(IMPORT_FIXTURE)
    await expect(page.getByTestId('building-switcher')).toHaveValue('csv-bayfront-commons')

    await ask(page, '2,000 SF under $60')
    await expect(lastAnswer(page).getByTestId('ask-status')).toContainText('Offline parsing')
    await expect(page.getByTestId('req-min-sf')).toHaveValue('2,000')
    await expect(page.getByTestId('req-max-rent')).toHaveValue('60')
    expect(chatPosts).toEqual([])
  })
})
